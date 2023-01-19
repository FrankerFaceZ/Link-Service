class CookieJar {

	clear() {
		if ( this.cookies )
			this.cookies.clear();
	}

	writeCookies(url, resp) {
		if ( ! this.cookies )
			return;

		// TODO: Get all relevant cookies for this request.
	}

	readCookies(url, resp) {
		//console.log('setCookies', url, resp.headers.raw()['set-cookie'])
	}

}

export default CookieJar;
