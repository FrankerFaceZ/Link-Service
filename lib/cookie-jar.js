import {
	CookieAccessInfo,
	CookieJar as WrappedCookieJar
} from 'cookiejar';

class CookieJar {

	clear() {
		this.cookies = null;
	}

	writeCookies(url, req) {
		if ( ! this.cookies )
			return;

		if ( !(url instanceof URL) )
			url = new URL(url);

		const access = CookieAccessInfo(url.hostname, url.pathname, url.protocol === 'https:', false),
			cookies = this.cookies.getCookies(access);

		if ( ! cookies )
			return;

		req.headers.cookie = cookies.map(cookie => cookie.toValueString()).join(';');
		//console.log('out cookies', url.toString(), req.headers.cookie);
	}

	allCookies() {
		if ( ! this.cookies )
			return [];

		return this.cookies.getCookies(CookieAccessInfo.All);
	}

	setCookie(url, cookie_str) {
		if ( ! this.cookies )
			this.cookies = new WrappedCookieJar;

		if ( !(url instanceof URL) )
			url = new URL(url);

		this.cookies.setCookies(cookie_str, url.hostname, url.pathname);
	}

	readCookies(url, resp) {
		const cookie_str = resp.headers.getSetCookie();
		//console.log('in cookies', url.toString(), JSON.stringify(cookie_str));
		if ( cookie_str )
			this.setCookie(url, cookie_str);
	}

}

export default CookieJar;
