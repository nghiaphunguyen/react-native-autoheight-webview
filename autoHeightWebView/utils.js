'use strict';

import { Dimensions, Platform } from 'react-native';

const domMutationObserveScript = `
  var MutationObserver =
    window.MutationObserver || window.WebKitMutationObserver;
  var observer = new MutationObserver(updateSize);
  observer.observe(document, {
    subtree: true,
    attributes: true
  });
`;

const updateSizeWithMessage = (element, scalesPageToFit) =>
  `
  var scale = ${scalesPageToFit ? 'screen.width / window.innerWidth' : '1'};
  var lastHeight = 0;
  var heightTheSameTimes = 0;
  var maxHeightTheSameTimes = 5;
  var forceRefreshDelay = 1000;
  var forceRefreshTimeout;

  function updateSize(event) {
    if (
      !window.hasOwnProperty('ReactNativeWebView') || 
      !window.ReactNativeWebView.hasOwnProperty('postMessage')
    ) {
      setTimeout(updateSize, 200);
      return;
    }
    height = Math.max(document.documentElement.clientHeight, document.documentElement.scrollHeight, document.body.clientHeight, document.body.scrollHeight);
    width = ${element}.offsetWidth || document.documentElement.offsetWidth;
    var needScale = width > screen.width;
    window.ReactNativeWebView.postMessage(JSON.stringify({ width: needScale ? width * scale : width, height: needScale ? height * scale : height }));

    // Make additional height checks (required to fix issues wit twitter embeds)
    clearTimeout(forceRefreshTimeout);
    if (lastHeight !== height) {
      heightTheSameTimes = 1;
    } else {
      heightTheSameTimes++;
    }

    lastHeight = height;

    if (heightTheSameTimes <= maxHeightTheSameTimes) {
      forceRefreshTimeout = setTimeout(
        updateSize,
        heightTheSameTimes * forceRefreshDelay
      );
    }
  }
  `;

// add viewport setting to meta
const makeScalePageToFit = (zoomable, scalesPageToFit) =>
  scalesPageToFit || Platform.OS === 'android'
    ? ''
    : `
  var meta = document.createElement("meta");
  meta.setAttribute("name", "viewport");
  meta.setAttribute("content", "width=device-width, user-scalable=${zoomable ? 'yes' : 'no'}");
  document.getElementsByTagName("head")[0].appendChild(meta);
`;

const getBaseScript = ({ style, zoomable, scalesPageToFit }) =>
  `
  ;
  if (!document.getElementById("rnahw-wrapper")) {
    var wrapper = document.createElement('div');
    wrapper.id = 'rnahw-wrapper';
    while (document.body.firstChild instanceof Node) {
      wrapper.appendChild(document.body.firstChild);
    }
    document.body.appendChild(wrapper);
  }
  ${updateSizeWithMessage('wrapper', scalesPageToFit)}
  window.addEventListener('load', updateSize);
  window.addEventListener('resize', updateSize);
  ${domMutationObserveScript}
  ${makeScalePageToFit(zoomable, scalesPageToFit)}
  updateSize();
  `;

const appendFilesToHead = ({ files, script }) =>
  files.reduceRight((combinedScript, file) => {
    const { rel, type, href } = file;
    return `
      var link  = document.createElement('link');
      link.rel  = '${rel}';
      link.type = '${type}';
      link.href = '${href}';
      document.head.appendChild(link);
      ${combinedScript}
    `;
  }, script);

const screenWidth = Dimensions.get('window').width;

const bodyStyle = `
body {
  margin: 0;
  padding: 0;
}
`;

const appendStylesToHead = ({ style, script }) => {
  const currentStyles = style ? bodyStyle + style : bodyStyle;
  // Escape any single quotes or newlines in the CSS with .replace()
  const escaped = currentStyles.replace(/\'/g, "\\'").replace(/\n/g, '\\n');
  return `
    var styleElement = document.createElement('style');
    styleElement.innerHTML = '${escaped}';
    document.head.appendChild(styleElement);
    ${script}
  `;
};

const getInjectedSource = ({ html, script }) => `
${html}
<script>
// prevents code colissions with global scope
(() => {
  ${script}
})();
</script>
`;

const getScript = ({ files, customStyle, customScript, style, zoomable, scalesPageToFit }) => {
  let script = getBaseScript({ style, zoomable, scalesPageToFit });
  script = files && files.length > 0 ? appendFilesToHead({ files, script }) : script;
  script = appendStylesToHead({ style: customStyle, script });
  customScript && (script = customScript + script);
  return script;
};

export const getWidth = style => {
  return style && style.width ? style.width : screenWidth;
};

export const isSizeChanged = ({ height, previousHeight, width, previousWidth }) => {
  if (!height || !width) {
    return;
  }
  return height !== previousHeight || width !== previousWidth;
};

export const reduceData = props => {
  const { source } = props;
  const script = getScript(props);
  const { html, baseUrl } = source;
  if (html) {
    return {
      currentSource: { baseUrl, html: getInjectedSource({ html, script }) }
    };
  } else {
    return {
      currentSource: source,
      script
    };
  }
};

export const shouldUpdate = ({ prevProps, nextProps }) => {
  if (!(prevProps && nextProps)) {
    return true;
  }
  for (const prop in nextProps) {
    if (nextProps[prop] !== prevProps[prop]) {
      if (typeof nextProps[prop] === 'object' && typeof prevProps[prop] === 'object') {
        if (
          shouldUpdate({
            prevProps: prevProps[prop],
            nextProps: nextProps[prop]
          })
        ) {
          return true;
        }
      } else {
        return true;
      }
    }
  }
  return false;
};
