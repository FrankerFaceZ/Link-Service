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
	}

	readCookies(url, resp) {
		const cookie_str = resp.headers.get('set-cookie');
		if ( ! cookie_str )
			return;

		if ( ! this.cookies )
			this.cookies = new WrappedCookieJar;

		if ( !(url instanceof URL) )
			url = new URL(url);

		this.cookies.setCookies(cookie_str, url.hostname, url.pathname);
	}

}

export default CookieJar;
