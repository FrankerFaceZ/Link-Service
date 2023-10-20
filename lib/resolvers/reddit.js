'use strict';

import Resolver from '../resolver';
import { Redirect, UseMetadata } from '../results';

export default class Reddit extends Resolver {

	transformURL(url, ctx) {

		ctx.cookies.setCookie(url, 'over18=1');

		// We only want to handle the over-18 check.
		/*if ( url.pathname === '/over18' ) {
			ctx.headers = {
				'Content-Type': 'application/x-www-form-urlencoded'
			};
			ctx.options = {
				method: 'POST',
				body: new URLSearchParams({
					over18: 'yes'
				}).toString()
			}
			return url;
		}*/

		return UseMetadata;
	}

	processBody(data, mode, ctx) {
		console.log('process-body', data);
		return null;
	}

}

Reddit.hosts = [
	'reddit.com'
];

Reddit.examples = [
	{title: 'Over 18 Post', url: 'https://www.reddit.com/r/PeopleFuckingDying/comments/16yvv7d/man_throws_cat_across_room/?rdt=47144'}
]
