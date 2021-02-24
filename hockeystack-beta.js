window.HockeyStack = (() => {
  'use strict'
  const HockeyStack = {};

  // VARIABLES
  const serverURL = 'https://hockeystack.com';
  const inactivityTime = 10;
  const eventListenerList = [];
  const actionLog = [];
  let inactivityCounter = 0;
  let isInactive = false;
  let scrollMax = 0;
  let lastActiveDate = new Date();
  let isDevicePhone;
  let globalCurrentPage = window.location.href;
  let exitedPage = false; // sometimes two consequent endSession() calls are made from event listeners in phones

  const documentAlias = document;
  const navigatorAlias = navigator;
  const windowAlias = window;

  HockeyStack.init = function (apiKey) {
    history.replaceState(null, null, document.URL);

    if (apiKey !== null) HockeyStack.apiKey = apiKey;
    if (isBot()) return; // if bot, don't run the script

    lastActiveDate = new Date();
    isDevicePhone = getDevice(navigatorAlias.userAgent.toLowerCase()) === 'phone';

    createAction('enter-page', globalCurrentPage);
    setTimeout(sendActions, 750); // concurrency issues

    // check if revisiting user
    if (!getCookie('hs_uuid')) setCookie('hs_uuid', getId(), 365);

    HockeyStack.trackSession();
  };

  HockeyStack.endSession = function () {
    let scrollDepth = (!hasVerticalScroll()) ? 100 : parseInt((scrollMax / (getDocHeight() - getViewportHeight())) * 100);
    if (scrollDepth > 100) scrollDepth = 100;

    if (isInactive) {
      createAction('scroll-depth', null, scrollDepth);
      createAction('end-session');
      sendActions('beacon');
      return;
    }

    let nextSiteURL = documentAlias.activeElement.href;
    if (sameSite(nextSiteURL) && globalCurrentPage !== nextSiteURL) {
      nextSiteURL = nextSiteURL.split('#')[0];
      const currentURL = windowAlias.location.origin + windowAlias.location.pathname;
      if (nextSiteURL.startsWith('http') && currentURL !== nextSiteURL) { // && currentURL === lastURL
        createAction('scroll-depth', null, scrollDepth);
        createAction('exit-page');
        sendActions('beacon');
      }
    } else {
      createAction('scroll-depth', null, scrollDepth);
      createAction('end-session');
      sendActions('beacon');
    }
  };

  HockeyStack.trackSession = () => {
    isInactive = false;

    addEvent(windowAlias, 'pagehide', () => {
      if (!exitedPage) {
        exitedPage = true;
        HockeyStack.endSession();
      }
    });

    if (isDevicePhone) {
      addEvent(windowAlias, 'pageshow', (event) => {
        if (event.persisted) HockeyStack.init(HockeyStack.apiKey);
      });
    }

    // manage sessions on window visibility events
    let hidden = 'hidden';

    function onchange () {
      if (!documentAlias[hidden]) {
        exitedPage = false;
        resetInactivity();
      } else {
        if (isDevicePhone && !exitedPage) {
          exitedPage = true;
          HockeyStack.endSession();
        }
      }
    }

    // Page Visibility API
    if (hidden in documentAlias) {
      addEvent(documentAlias, 'visibilitychange', onchange)
    } else if ((hidden = 'mozHidden') in documentAlias) {
      addEvent(documentAlias, 'mozvisibilitychange', onchange)
    } else if ((hidden = 'webkitHidden') in documentAlias) {
      addEvent(documentAlias, 'webkitvisibilitychange', onchange)
    } else if ((hidden = 'msHidden') in documentAlias) {
      addEvent(documentAlias, 'msvisibilitychange', onchange)
    } else if ('onfocusin' in documentAlias) { // IE 9 and lower:
      addEvent(windowAlias, 'focusin', () => resetInactivity());
    } else { // All others:
      addEvent(windowAlias, 'focus', () => {
        resetInactivity();
      });
    };

    function onClickFunc (e) {
      if (!window.innerPageClick) return;
      resetInactivity();

      const obj = getClickInfo(e.target);
      createAction('onclick', null, obj);
      urlRefresh();
    };

    let scrollHeight = 0;

    function onScrollFunc (e) {
      resetInactivity();

      scrollHeight = Math.max(scrollHeight, window.scrollY, document.body.scrollTop, document.documentElement.scrollTop);
      if (scrollHeight > scrollMax) scrollMax = scrollHeight;
    };

    function onSubmitFunc (e) {
      resetInactivity();

      console.log(getClickInfo(e.target))
      for (let i = 0; i < e.target.elements.length; i++) {
        const element = e.target.elements[i];
        if (element.type === 'search') {
          const obj = { ...getClickInfo(e.target), value: element.value };
          createAction('onsearch', null, obj);
          return;
        }
      }
    };

    addEvent(document, 'mouseover', () => {
      window.innerPageClick = true;
    });
    addEvent(document, 'mouseleave', () => {
      window.innerPageClick = false;
    });

    function resetInactivity () {
      if ((new Date().getTime()) - lastActiveDate.getTime() > (1000 * 60 * inactivityTime)) {
        isInactive = true;
        HockeyStack.endSession();
      }
      lastActiveDate = new Date();
      inactivityCounter = 0;

      if (isInactive) {
        HockeyStack.init(HockeyStack.apiKey);
      }
      isInactive = false;
    };

    addEvent(windowAlias, 'mousemove', resetInactivity);
    addEvent(windowAlias, 'click', (e) => onClickFunc(e));
    addEvent(windowAlias, 'scroll', (e) => onScrollFunc(e));
    addEvent(windowAlias, 'submit', (e) => onSubmitFunc(e));
    addEvent(windowAlias, 'keydown', resetInactivity);

    // track user inactivity
    const inactivityCheck = setInterval(() => {
      inactivityCounter++;
      if (inactivityCounter >= inactivityTime) inactivityEndSession();
    }, 60000);

    function inactivityEndSession () {
      clearInterval(inactivityCheck);
      isInactive = true;
      HockeyStack.endSession();
    }
  };

  // HOCKEYSTACK METHODS
  HockeyStack.serialize = (value) => {
    if (typeof value === 'object' || typeof value === 'number') {
      value = JSON.stringify(value);
    }
    return value;
  }

  // OTHER METHODS
  const addEvent = (element, type, listener) => {
    if (eventListenerList.includes(type)) return;
    if (typeof element.addEventListener !== 'undefined') element.addEventListener(type, listener, false);
    else element.attachEvent('on' + type, listener);
    eventListenerList.push(type);
  };

  const urlRefresh = () => {
    globalCurrentPage = window.location.href;
  }

  const createAction = (actionType, URL, actionInfo) => {
    const actionObject = {
      actionType: actionType,
      actionDate: (isInactive) ? new Date(lastActiveDate.getTime()).toISOString() : new Date().toISOString()
    };

    const currentURL = URL || (windowAlias.location.origin + windowAlias.location.pathname);
    const localCurrentPage = globalCurrentPage;

    if (actionType === 'onclick') {
      actionObject.actionElement = actionInfo.element;
      if (actionInfo.text) actionObject.actionText = actionInfo.text;
      if (actionInfo.url) {
        actionObject.actionURL = actionInfo.url;
        if (actionInfo.url === currentURL && currentURL !== localCurrentPage) { // for spa
          createAction('onclick', localCurrentPage, actionInfo);
          const scrollDepth = (!hasVerticalScroll()) ? 100 : parseInt((scrollMax / (getDocHeight() - getViewportHeight())) * 100);
          createAction('scroll-depth', localCurrentPage, scrollDepth);
          createAction('exit-page', localCurrentPage);
          createAction('enter-page', actionInfo.url);
          sendActions();
          addEvent(window, 'popstate', () => {
            if (window.innerPageClick) {
              // your own in-page
            } else {
              // Browser back button was clicked
              createAction('onclick', globalCurrentPage, actionInfo);
              const scrollDepth = (!hasVerticalScroll()) ? 100 : parseInt((scrollMax / (getDocHeight() - getViewportHeight())) * 100);
              createAction('scroll-depth', globalCurrentPage, scrollDepth);
              createAction('exit-page', globalCurrentPage);
              createAction('enter-page', windowAlias.location.origin + windowAlias.location.pathname);
              sendActions();
              globalCurrentPage = windowAlias.location.origin + windowAlias.location.pathname;
            }
          });
          return;
        }
      }
    } else if (actionType === 'onsearch') {
      actionObject.actionValue = actionInfo.value;
      actionObject.actionElement = actionInfo.element;
    } else if (actionType === 'scroll-depth') actionObject.actionNumber = actionInfo;
    actionLog.push({ action: actionObject, url: currentURL });
  };

  const sendActions = (type) => {
    if (type === 'beacon') sendReqViaBeacon();
    else sendReqViaXHR();
    actionLog.length = 0;
  }

  const supportsSendBeacon = () => {
    return typeof navigatorAlias === 'object' &&
      typeof navigatorAlias.sendBeacon === 'function' &&
      typeof Blob === 'function';
  };

  const sendReqViaBeacon = () => {
    const isSupported = supportsSendBeacon();

    if (!isSupported) return false;
    if (actionLog.length === 0) return false;

    const customerObject = {
      website: window.location.hostname,
      apiKey: HockeyStack.apiKey
    };
    const userObject = getUserProperties();
    const referrer = document.referrer;
    const requestObj = { customerObject, userObject, actionLog, referrer };

    let success = false;

    try {
      success = navigatorAlias.sendBeacon(serverURL + '/data/send-beta', JSON.stringify(requestObj));
    } catch (e) {
      return false;
    }
    return success;
  };

  const sendReqViaXHR = () => {
    if (actionLog.length === 0) return false;

    const customerObject = {
      website: window.location.hostname,
      apiKey: HockeyStack.apiKey
    };
    const userObject = getUserProperties();
    const referrer = document.referrer;
    const requestObj = { customerObject, userObject, actionLog, referrer };

    const request = new XMLHttpRequest();
    request.open('POST', serverURL + '/data/send-beta', true);
    request.setRequestHeader('Content-Type', 'text/plain; charset=UTF-8');
    request.send(JSON.stringify(requestObj));

    request.onreadystatechange = () => {
      return true;
    }
  };

  const sameSite = (uri) => {
    if (typeof uri === 'undefined') return false;

    const matches = uri.match(/^(https?:)?\/\/([^/]+)/);
    if (!matches) return true;

    return windowAlias.location.host === matches[2];
  };

  const getId = () => {
    return getCookie('hs_uuid') || generateUUID();
  };

  const generateUUID = () => {
    let d = new Date().getTime();
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
  };

  const setCookie = (cookieKey, value, days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const cookieValue = value + ((days == null) ? '' : '; expires=' + date.toUTCString()) + '; path=/;SameSite=Lax';
    documentAlias.cookie = cookieKey + '=' + cookieValue;
  };

  const getCookie = (cookieKey) => {
    let i;
    let k;
    let v;
    const cookieArray = documentAlias.cookie.split(';');

    for (i = 0; i < cookieArray.length; i++) {
      k = cookieArray[i].substr(0, cookieArray[i].indexOf('='));
      v = cookieArray[i].substr(cookieArray[i].indexOf('=') + 1);
      k = k.replace(/^\s+|\s+$/g, '');

      if (k === cookieKey) return v;
    }
    return null;
  };

  const isBot = () => {
    const userAgent = navigatorAlias.userAgent.toLowerCase();
    return /(nuhk|googlebot|googlesecurityscanner|slurp|ask jeeves\/teoma|ia_archiver|google web preview|mediapartners-google|baiduspider|ezooms|yahooseeker|altavista|mercator|scooter|infoseek|ultraseek|lycos|wget|yandex|yadirectfetcher|magpie-crawler|nutch crawler|cms crawler|domnutch|netseer|digincore|fr-crawler|wesee|aliasio|bingpreview|headlesschrome|facebookexternalhit|facebookplatform|facebookexternalua|fb_iab|fbav|bot|crawler|sp(i|y)der|search|worm|fetch|nutch)/.test(userAgent);
  }

  const getDevice = (userAgent) => {
    return /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(userAgent) ? 'tablet'
      : /(mobi|ipod|phone|blackberry|opera mini|fennec|minimo|symbian|psp|nintendo ds|archos|skyfire|puffin|blazer|bolt|gobrowser|iris|maemo|semc|teashark|uzard)/.test(userAgent) ? 'phone'
        : 'desktop';
  };

  const getUserProperties = () => {
    return {
      language: navigatorAlias.language,
      platform: navigatorAlias.platform,
      uuid: getId()
    }
  };

  const getDocHeight = () => {
    const d = documentAlias;
    return Math.max(
      Math.max(d.body.scrollHeight, d.documentElement.scrollHeight),
      Math.max(d.body.offsetHeight, d.documentElement.offsetHeight),
      Math.max(d.body.clientHeight, d.documentElement.clientHeight)
    );
  };

  const getViewportHeight = () => {
    const d = documentAlias;
    return Math.min(
      Math.min(d.body.clientHeight, d.documentElement.clientHeight),
      Math.min(d.body.offsetHeight, d.documentElement.offsetHeight),
      window.innerHeight
    );
  };

  const hasVerticalScroll = () => {
    if (windowAlias.innerHeight) {
      return documentAlias.body.offsetHeight > windowAlias.innerHeight;
    } else {
      return documentAlias.documentElement.scrollHeight >
        documentAlias.documentElement.offsetHeight ||
        documentAlias.body.scrollHeight > documentAlias.body.offsetHeight;
    }
  };

  const getClickInfo = el => {
    const path = [];
    let text = '';
    let url = '';

    if (el.placeholder) text = el.placeholder;
    else if (el.innerText) {
      let innerText = el.innerText.replace(/\n/g, ' ');
      if (innerText.length > 103) innerText = innerText.substring(0, 100) + '...';
      text = innerText;
    }
    text = text.trim();

    if (el.src) url = el.src;
    else if (el.href && el.href !== '') url = el.href;
    url = url.trim();

    while (el.parentNode) {
      let t = el.tagName.toLowerCase();
      if (el.id) {
        t += '#' + el.id;
        path.unshift(t);
        break;
      } else {
        const isSVG = (el.nodeType === 1 && el.namespaceURI === 'http://www.w3.org/2000/svg');
        const className = (isSVG ? (el.className ? el.className.baseVal : el.getAttribute('class')) : el.className).trim() || '';
        if (className !== '') t += '.' + className.replace(/ +/g, '.');

        const parentElement = el.parentElement;
        if (parentElement) {
          const siblings = parentElement.querySelectorAll(t);
          if (siblings.length > 1) {
            for (let i = 0; i < siblings.length; i++) {
              if (siblings[i] === el) {
                t += ':nth-of-type(' + (i + 1) + ')';
              }
            }
          }
        }

        path.unshift(t);
        el = el.parentNode;
      }
    }
    const res = { element: path.join(' ') };
    if (text !== '') res.text = text;
    if (url !== '') res.url = url;
    return res;
  };

  return HockeyStack;
})();
