'use strict';

import SimpleOAuth2 from 'simple-oauth2';
import fetch from './fetch-timeout';

class TwitchAPI {
	constructor(opts) {

		this.client_id = opts.id;
		this.secret = opts.secret;
		this.scope = opts.scope || '';

		this.oauth = SimpleOAuth2.create({
			client: {
				id: this.client_id,
				secret: this.secret
			},
			auth: {
				tokenHost: 'https://id.twitch.tv',
				tokenPath: '/oauth2/token',
				authorizePath: '/oauth2/authorize',
				revokePath: '/oauth2/revoke'
			},
			options: {
				authorizationMethod: 'body',
				bodyFormat: 'json'
			}
		});

		this.fetch = this.fetch.bind(this);
	}

	async fetch(url, options = {}) {
		options = options || {};
		const headers = options.headers = options.headers || {},
			version = options.version;

		options.version = undefined;

		if ( version && ! headers.Accept )
			headers.Accept = `application/vnd.twitchtv.v${version}+json`;

		headers['Client-ID'] = this.client_id;
		let helix = false;

		if ( url.startsWith('/') ) {
			url = `https://api.twitch.tv${url}`;
			helix = version ? false : url.includes('api.twitch.tv/helix/');

		} else if ( ! url.includes('://') ) {
			if ( version ) {
				url = `https://api.twitch.tv/kraken/${url}`;
				helix = false;
			} else {
				url = `https://api.twitch.tv/helix/${url}`;
				helix = true;
			}
		} else
			helix = url.includes('api.twitch.tv/helix/');

		let used_token = false;
		if ( helix && ! headers.Authorization && ! options.no_token ) {
			const token = await this.getAppToken();

			headers.Authorization = `Bearer ${token.access_token}`;
			used_token = true;
		}

		const request = fetch(url, options);
		if ( ! helix )
			return request;

		const resp = await request;
		if ( used_token && ! resp.ok && resp.status === 401 ) {
			const authenticate = resp.headers.get('WWW-Authenticate');
			if ( authenticate ) {
				const token = await this.getAppToken(true);

				headers.Authorization = `Bearer ${token.access_token}`;
				return fetch(url, options);
			}
		}

		return resp;
	}

	async getAppToken(force_refresh = false) {
		if ( ! force_refresh ) {
			// Try returning our cached key first.
			if ( this.token?.access_token )
				return this.token;
		}

		const token = await this.oauth.clientCredentials.getToken({
			scope: this.scope
		});

		if ( ! token )
			throw new Error('Unable to get app token from Twitch.');

		this.token = token;
		return token;
	}

}


export default TwitchAPI;
