(function (root, factory) {
  if(typeof define === 'function' && define.amd) { // AMD
    root.HockeyStack = factory(root.HockeyStack);
  } else if(typeof module === 'object' && module.exports) { // Node
    module.exports = factory(root.HockeyStack);
  } else { // Browser globals
    root.HockeyStack = factory(root.HockeyStack);
  }
}(typeof window !== 'undefined' ? window : this, function (HockeyStack) {
  'use strict';

  HockeyStack = HockeyStack || {};

  // VARIABLESa
  const serverURL = 'https://hockeystack.com';
  const inactivityTime = 5;
  let inactivityCounter = 0;
  let isInactive = false;
  let scrollMax = 0;
  let eventListenerList = [];
  let lastActiveDate = new Date();
  let isDevicePhone;
  let browser;

  const documentAlias = document;
  const navigatorAlias = navigator;
  const windowAlias = window;

  // INITIALIZE PLUGIN
  HockeyStack.init = function (apiKey) {
    if (apiKey !== null) HockeyStack.apiKey = apiKey;
    if (isBot()) return; // if bot, don't run the script

    browser = getBrowser();
    lastActiveDate = new Date();
    isDevicePhone = getDevice(navigatorAlias.userAgent.toLowerCase()) === 'phone';

    if (!localStorage.getItem('hs_eq')) HockeyStack.startSession();
    else HockeyStack.trackSession();
  };

  // HOCKEYSTACK METHODS
  HockeyStack.serialize = (value) => {
    if (typeof value === 'object' || typeof value === 'number') {
      value = JSON.stringify(value);
    }
    return value;
  };

  HockeyStack.startSession = () => {
    isInactive = false;
    addAction('start-session');

    // check if revisiting user
    if (!getCookie('hs_uuid')) setCookie('hs_uuid', getId(), 365);

    sendReqViaBeacon(serverURL + '/data/send');
    HockeyStack.trackSession();
  };

  HockeyStack.endSession = function () {
    if (!localStorage.getItem('hs_eq')) return;

    let scrollDepth = (!hasVerticalScroll()) ? 100 : parseInt((scrollMax / (getDocHeight() - getViewportHeight())) * 100);
    if (scrollDepth > 100) scrollDepth = 100;

    if (isInactive) {
      addAction('scroll-depth', null, scrollDepth);
      addAction('end-session');

      sendReqViaBeacon(serverURL + '/data/send');

      removeLocalStorageItems();
      return;
    }

    let nextSiteURL = documentAlias.activeElement.href;
    if (sameSite(nextSiteURL)) {
      nextSiteURL = nextSiteURL.split('#')[0];
      const lastURL = JSON.parse(localStorage.getItem('hs_eq')).slice(-1)[0].url;
      const currentURL = windowAlias.location.origin + windowAlias.location.pathname;
      if (nextSiteURL.startsWith('http') && currentURL !== nextSiteURL && currentURL === lastURL) {
        addAction('scroll-depth', null, scrollDepth);
        addAction('exit-page');
        addAction('enter-page', nextSiteURL);
      }
    } else {
      addAction('scroll-depth', null, scrollDepth);
      addAction('end-session');

      sendReqViaBeacon(serverURL + '/data/send');

      removeLocalStorageItems();
    }
  };

  HockeyStack.trackSession = () => {
    const lastDateFromQueue = new Date(JSON.parse(localStorage.getItem('hs_eq')).splice(-1)[0].actions.splice(-1)[0].actionDate);
    if ((new Date().getTime()) - lastDateFromQueue.getTime() > (1000 * 60 * inactivityTime)) {
      isInactive = true;
      lastActiveDate = lastDateFromQueue;

      const scrollDepth = JSON.parse(localStorage.getItem('hs_sdkey')) * 10; // if there still isn't a scroll-depth value, returns 0

      const lastURLFromQueue = JSON.parse(localStorage.getItem('hs_eq')).splice(-1)[0].url;
      addAction('scroll-depth', lastURLFromQueue, scrollDepth);
      addAction('end-session', lastURLFromQueue);

      sendReqViaBeacon(serverURL + '/data/send');

      removeLocalStorageItems();

      isInactive = false;
      inactivityCounter = 0;
      HockeyStack.init(HockeyStack.apiKey);
    }

    if (isDevicePhone) {
      addEvent(windowAlias, 'pagehide', () => {
        HockeyStack.endSession();
      });
    } else {
      addEvent(windowAlias, 'beforeunload', () => {
        HockeyStack.endSession();
      });
    }

    // manage sessions on window visibility events
    let hidden = 'hidden';

    function onchange () {
      if (!documentAlias[hidden]) resetInactivity();
      else {
        if (isDevicePhone) {
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
      addEvent(windowAlias, 'pageshow', () => {
        resetInactivity();
      });
    };

    function onClickFunc (e) {
      resetInactivity();

      const obj = getClickInfo(e.target);
      addAction('onclick', null, obj);
    };

    let scrollHeight = 0;

    function onScrollFunc (e) {
      resetInactivity();

      scrollHeight = Math.max(scrollHeight, window.scrollY, document.body.scrollTop, document.documentElement.scrollTop);
      if (scrollHeight > scrollMax) {
        scrollMax = scrollHeight;

        if (isDevicePhone && browser === 'Safari') {
          let scrollDepth = (!hasVerticalScroll()) ? 100 : parseInt((scrollMax / (getDocHeight() - getViewportHeight())) * 100);
          if (scrollDepth > 100) scrollDepth = 100;
          const localScrollDepth = JSON.parse(localStorage.getItem('hs_sdkey'));
          if (parseInt(scrollDepth / 10) > localScrollDepth) localStorage.setItem('hs_sdkey', parseInt(scrollDepth / 10))
        }
      }
    };

    function resetInactivity () {
      if ((new Date().getTime()) - lastActiveDate.getTime() > (1000 * 60 * inactivityTime)) {
        isInactive = true;
        HockeyStack.endSession();
      }
      lastActiveDate = new Date();
      inactivityCounter = 0;
      isInactive = false;

      if (localStorage.getItem('hs_eq') === null) {
        HockeyStack.init(HockeyStack.apiKey);
      }
    };

    addEvent(windowAlias, 'mousemove', resetInactivity);
    addEvent(windowAlias, 'click', (e) => onClickFunc(e));
    addEvent(windowAlias, 'scroll', (e) => onScrollFunc(e));
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

  // OTHER METHODS
  const addEvent = (element, type, listener) => {
    if (eventListenerList.includes(type)) return;
    if (typeof element.addEventListener !== 'undefined') element.addEventListener(type, listener, false);
    else element.attachEvent('on' + type, listener);
    eventListenerList.push(type);
  };

  const addAction = (actionType, URL, actionInfo) => {
    let actionObject = {
      actionType: actionType,
      actionDate: (isInactive) ? new Date(lastActiveDate.getTime()).toISOString() : new Date().toISOString(),
    };

    if (actionType === 'onclick') {
      actionObject.actionElement = actionInfo.element;
      if (actionInfo.text) actionObject.actionText = actionInfo.text;
      if (actionInfo.url) actionObject.actionURL = actionInfo.url;
    } else if (actionType === 'scroll-depth') actionObject.actionNumber = actionInfo;

    const currentURL = (!URL) ? (windowAlias.location.origin + windowAlias.location.pathname): URL;
    const queue = JSON.parse(localStorage.getItem('hs_eq')) || [];
    const len = queue.length;

    if (len === 0 || queue[len - 1].url !== currentURL) {
      let pagesObject = {
        url: currentURL,
        actions: [actionObject]
      }
      queue.push(pagesObject);
    } else {
      queue[len - 1].actions.push(actionObject);
    }
    localStorage.setItem('hs_eq', HockeyStack.serialize(queue));
  };

  const removeLocalStorageItems = () => {
    localStorage.removeItem('hs_eq');
    localStorage.removeItem('hs_sdkey');
  };

  const supportsSendBeacon = () => {
    return typeof navigatorAlias === 'object' &&
      typeof navigatorAlias.sendBeacon === 'function' &&
      typeof Blob === 'function';
  };

  const sendReqViaBeacon = (url) => {
    const isSupported = supportsSendBeacon();

    if (!isSupported) return false;

    const customerObject = {
      website: window.location.hostname,
      apiKey: HockeyStack.apiKey
    };
    const userObject = getUserProperties();
    const sessionObject = localStorage.getItem('hs_eq');
    const referrer = document.referrer;
    const requestObj = { customerObject, userObject, sessionObject, referrer };

    const headers = { type: 'application/x-www-form-urlencoded; charset=UTF-8' };
    let success = false;

    try {
      const blob = new Blob([JSON.stringify(requestObj, null, 2)], headers);

      success = navigatorAlias.sendBeacon(url, blob);
    } catch (e) {
      return false;
    }

    return success;
  };

  const sameSite = (uri) => {
    if (typeof uri === 'undefined') return false;

    const matches = uri.match(/^(https?:)?\/\/([^\/]+)/);
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
    const cookieValue = value + ((days == null) ? '' : '; expires=' + date.toUTCString()) + '; secure; path=/';
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
    return /(nuhk|googlebot|googlesecurityscanner|yammybot|openbot|slurp|msnbot|ask jeeves\/teoma|ia_archiver|bingbot|google web preview|mediapartners-google|adsbot-google|baiduspider|ezooms|yahooseeker|altavista|avsearch|mercator|scooter|infoseek|ultraseek|lycos|wget|yandexbot|yandex|yadirectfetcher|sitebot|exabot|ahrefsbot|mj12bot|turnitinbot|magpie-crawler|nutch crawler|cms crawler|rogerbot|domnutch|ssearch_bot|xovibot|netseer|digincore|fr-crawler|wesee|aliasio|contxbot|pingdombot|bingpreview|headlesschrome)/.test(userAgent);
  }

  const getDevice = (userAgent) => {
    return /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(userAgent) ? 'tablet'
              : /(mobi|ipod|phone|blackberry|opera mini|fennec|minimo|symbian|psp|nintendo ds|archos|skyfire|puffin|blazer|bolt|gobrowser|iris|maemo|semc|teashark|uzard)/.test(userAgent) ? 'phone'
              : 'desktop';
  };

  const getBrowser = () => {
    const ua = navigatorAlias.userAgent.toLowerCase();
    let browser;

    if ((ua.indexOf('opera') !== -1 || ua.indexOf('opr')) !== -1) browser = 'Opera';
    else if (ua.indexOf('chrome') !== -1 || ua.indexOf('crios') !== -1) browser = 'Chrome';
    else if (ua.indexOf('firefox') !== -1) browser = 'Firefox';
    else if (ua.indexOf('safari') !== -1) browser = 'Safari';
    else if ((ua.indexOf('msie') !== -1) || (!!documentAlias.documentMode)) browser = 'IE';
    else browser = 'unknown';

    return browser;
  };

  const getOS = () => {
    let platform = navigatorAlias.platform;
    if (!platform) return 'Android';
    platform = platform.toLowerCase();
    if (platform.startsWith('ip')) return 'IOS';
    else if (platform.startsWith('win')) return 'Windows';
    else if (platform.startsWith('mac')) return 'Mac';
    else if (platform.startsWith('playstation') || platform.startsWith('psp')) return 'Sony';
    else if (/Android/.test(navigatorAlias.userAgent)) return 'Android';
    else if (platform.startsWith('linux')) return 'Linux';
    else return 'unknown'
  };

  const getUserProperties = () => {
    const userAgent = navigatorAlias.userAgent.toLowerCase();

    return {
      browser: getBrowser(),
      os: getOS(),
      device: getDevice(userAgent),
      cookieEnabled: navigatorAlias.cookieEnabled,
      language: navigatorAlias.language,
      location: '',
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
    let path = [];
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
        if (el.className) t += '.' + el.className.replace(/ /g, '.');

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

  // RETURN OBJECT
  return HockeyStack;
}));
