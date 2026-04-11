export class TokenProvider {
  constructor() { this._token = null; }

  async getToken() {
    if (this._token) return this._token;
    return this.refreshToken();
  }

  async refreshToken() {
    const metaToken = this._fromMetaTag();
    if (metaToken) { this._token = metaToken; return this._token; }
    const cookieToken = this._fromCookie();
    if (cookieToken) { this._token = cookieToken; return this._token; }
    const scriptToken = this._fromInlineScript();
    if (scriptToken) { this._token = scriptToken; return this._token; }
    throw new Error('Unable to extract CSRF token');
  }

  invalidate() { this._token = null; }

  _fromMetaTag() {
    const selectors = ['meta[name="csrf-token"]', 'meta[name="csrftoken"]', 'meta[property="fb:dtsg"]'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el.getAttribute('content');
    }
    return null;
  }

  _fromCookie() {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'csrftoken' || name === 'fb_dtsg') return decodeURIComponent(value);
    }
    return null;
  }

  _fromInlineScript() {
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data?.dtsg?.token) return data.dtsg.token;
      } catch { }
    }
    return null;
  }
}
