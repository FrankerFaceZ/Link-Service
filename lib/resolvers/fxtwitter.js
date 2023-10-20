'use strict';

import Resolver from "../resolver";
import { UseMetadata } from "../results";

import dayjs from "dayjs";

import twitter from 'twitter-text';

import {refToken, formatToken, iconToken, i18nToken, linkToken, styleToken, conditionalToken, galleryToken, overlayToken, imageToken, boxToken} from '../builder';
import { linkify, linkifyEmail, linkifyMatching, truncate } from "../utilities";

const API_BASE = `https://api.fxtwitter.com`;

const BAD_URLS = ['i', 'about', 'privacy', 'settings', 'tos'];
const PROFILE_ACTIONS = ['with_replies', 'media', 'following', 'followers', 'likes'];

const VALID_HOSTS = [
	'twitter.com',
	'www.twitter.com',
	'm.twitter.com',
	'x.com',
	'www.x.com',
	'm.x.com',
	'fxtwitter.com',
	'pxtwitter.com',
	'twittpr.com',
	'fixupx.com',
	'vxtwitter.com',
	'nitter.net'
];


const Weight = Symbol('Weight');

const MENTION_REGEX = /(?<=^|[^@\w])@(\w{1,15})\b/g;
const REPLY_SPLIT = /^\s*@(\w{1,15})\s+/;


function splitReplies(text) {
	const replies = [];

	let match;
	while ( match = REPLY_SPLIT.exec(text) ) {
		replies.push(match[1]);
		text = text.slice(match[0].length);
	}

	return {
		text,
		replies
	};
}


export default class FxTwitter extends Resolver {

	transformURL(url, ctx) {
		if ( ! VALID_HOSTS.includes(url.hostname) )
			return UseMetadata;

		const parts = url.pathname.split('/');
		if ( parts[1] === 'i' && parts[2] === 'web' && parts[3] === 'status' )
			parts.shift();

		const username = parts[1],
			action = parts[2];

		if ( BAD_URLS.includes(username) )
			return UseMetadata;

		if ( action === 'status' ) {
			ctx.mode = 'tweet';
			const tweet_id = ctx.tweet_id = parts[3];
			ctx.cache_key = `fxtweet-${tweet_id}`;
			return `${API_BASE}/${username}/status/${tweet_id}`;

		} else if ( ! action || PROFILE_ACTIONS.includes(action) ) {
			ctx.mode = 'profile';
			ctx.cache_key = `fxtweet-user-${username}`;
			return `${API_BASE}/${username}`;
		}

		return UseMetadata;
	}

	processBody(data, mode, ctx) {
		if ( ! data || mode !== 'json' )
			return null;

		if ( ctx.mode === 'tweet' && data.tweet )
			return this.processTweet(data.tweet, ctx);

		if ( ctx.mode === 'profile' && data.user )
			return this.processUser(data.user, ctx);

		// Unexpected Result, fallback to metadata
		console.log('unexpected result', data);

		return UseMetadata;
	}

	processTweet(data, ctx) {
		const time = dayjs(data.created_at);
		const fragments = {};

		// Is this a quote?
		const quote_link = data.quote?.url;
		let quoted;
		if ( data.quote ) {
			quoted = {
				type: 'link', embed: true, interactive: true, tooltip: false, url: quote_link, content: [
					this.renderUserHeader(data.quote.author, true),
					this.renderBody(data.quote)
				]
			};
		}

		const i18n_key = data.replying_to_status ? 'replied' : 'tweeted',
			i18n_phrase = data.replying_to_status ? 'replied: {tweet}' : 'tweeted: {tweet}';

		const actions = [];

		if ( data.author.screen_name && data.id )
			actions.push({
				type: 'link',
				title_i18n: 'nitter',
				title: 'View with Nitter',
				href: `https://nitter.net/${data.author.screen_name}/status/${data.id}`
			});

		return {
			v: 6,
			accent: '#1da1f2', // I am dead-branding a corporation. Suck it, Musk
			i18n_prefix: 'embed.twitter',

			fragments,

			actions,

			short: this.renderUserHeader(
				data.author, true,
				this.builder().addI18n(i18n_key, i18n_phrase, {
					tweet: refToken('body')
				}),
				this.builder()
					.addIcon('twitter')
					.addI18n(
						'info-line',
						'{created,time} • {created,date} • {retweets,plural,one {# Retweet} other {# Retweets}} • {likes,plural,one {# Like} other {# Likes}}', {
							created: time,
							retweets: data.retweets,
							likes: data.likes
						}
					)
			),

			full: this.builder()
				.add(this.renderUserHeader(data.author))
				.add(this.renderBody(data, 'body', fragments))
				.add(quoted)
				.addField(i18nToken('retweets', 'Retweets'), formatToken('number', data.retweets ?? 0), true)
				.addField(i18nToken('replies', 'Replies'), formatToken('number', data.replies ?? 0), true)
				.addField(i18nToken('likes', 'Likes'), formatToken('number', data.likes ?? 0), true)
				.addField(i18nToken('views', 'Views'), formatToken('number', data.views ?? 0), true)
				.setFooter(
					null,
					[
						iconToken('twitter'),
						'Twitter • ',
						formatToken('time', time),
						' • ',
						formatToken('date', time),
						' • ',
						data.source
					]
				)
		}
	}

	processUser(data, ctx) {
		const link = data.website,
			joined = dayjs(data.joined);

		const fragments = {
			body: data.description
		};

		const actions = [];

		if ( data.screen_name )
			actions.push({
				type: 'link',
				title_i18n: 'nitter',
				title: 'View with Nitter',
				href: `https://nitter.net/${data.screen_name}`
			});

		return {
			v: 6,
			accent: '#1da1f2',
			i18n_prefix: 'embed.twitter',

			fragments,
			actions,

			short: this.renderUserHeader(
				data, true,
				refToken('body'),
				this.builder()
					.add(iconToken('twitter'))
					.addI18n(
						'profile-line',
						'{tweets,plural,one {# Tweet} other {# Tweets}} • {following,number} Following • {followers,number} Followers • Joined {joined,date}', {
							joined,
							tweets: data.tweets ?? 0,
							following: data.following ?? 0,
							followers: data.followers ?? 0
						}
					)
			),

			full: this.builder()
				.add(this.renderUserHeader(
					data,
					true,
					this.builder()
						.add(data.location ? [iconToken('location'), ' ', data.location, ' '] : null)
						.add(link ? [iconToken('link'), ' ', linkToken(link.url, link.display_url), ' '] : null)
						.add([iconToken('calendar'), ' ', formatToken('date', joined)]),
					null,
					data.banner_url
						? imageToken(data.banner_url, {aspect: 16/9})
						: null
				))
				.add(this.renderBody(data, 'body', fragments))
				.addField(i18nToken('following', 'Following'), formatToken('number', data.following || 0), true)
				.addField(i18nToken('tweets', 'Tweets'), formatToken('number', data.tweets || 0), true)
				.addField(i18nToken('likes', 'Likes'), formatToken('number', data.likes || 0), true)
				.setFooter(
					null,
					[
						iconToken('twitter'),
						'Twitter'
					]
				)
		}
	}

	renderBody(data, fragment, fragments) {

		let text = data.text ?? data.description;

		let replies = null;
		if ( data.replying_to_status ) {
			const out = splitReplies(text);
			replies = out.replies;
			text = out.text;

			if ( replies.length > 4 )
				replies = i18nToken(
					'reply-and-others',
					'Replying to {name}, {second}, and {count} others',
					{
						name: replies[0],
						second: replies[1],
						count: replies.length - 2
					}
				);
			else if ( replies.length > 0 ) {
				const new_replies = [];
				for (const reply of replies) {
					new_replies.push(reply);
					new_replies.push(' ');
				}

				// TODO: Comma-tize the list.
				replies = i18nToken(
					'reply-list',
					'Replying to {names}',
					{names: new_replies}
				);
			} else
				replies = null;
		}

		// Handle clickability and stuff.
		if ( ! fragment || fragments ) {

			// Handle email addresses first.
			text = linkifyEmail(text);

			// Note: Links are worth 23 characters
			text = linkify(text, (url, match) => {
				if ( !(url instanceof URL) )
					url = new URL(`${match[1] ? '' : 'https://'}${url}`);

				// Use the same display logic as Twitter.
				let path = url.toString().slice(url.origin.length);
				if ( path.length > 15 )
					path = path.slice(0, 15) + '…';
				if ( path === '/' )
					path = '';

				return linkToken(
					url.toString(),
					url.host + path,
					{
						[Weight]: 23
					}
				);
			});

			// Now, make other twitter shit linkable.
			// ... mentions
			text = linkifyMatching(text, twitter.regexen.validMentionOrList, match => {
				const tag = match[2] + match[3];
				return linkToken(
					`https://twitter.com/${match[3]}`,
					tag
				);
			}, match => match[1].length);

			// ... hashtags
			text = linkifyMatching(text, twitter.regexen.validHashtag, match => {
				const tag = match[2] + match[3];
				return linkToken(
					`https://twitter.com/search?q=${encodeURIComponent(tag)}`,
					tag,
					{tooltip: false}
				);
			}, match => match[1].length);

			// ... cashtags?
			text = linkifyMatching(text, twitter.regexen.validCashtag, match => {
				const tag = match[2] + match[3];
				return linkToken(
					`https://twitter.com/search?q=${encodeURIComponent(tag)}`,
					tag,
					{tooltip: false}
				);
			}, match => match[1].length);


			// We're done with clickability.
			// Finally, silence mfers who pay for twitter.
			// i ain't readin all that i'm happy for you or sorry it happened
			let truncated = false;

			if ( typeof text === 'string' ) {
				const len = text.length;
				text = truncate(text, 280, 15, '…', false, false);
				truncated = len !== text.length;

			} else if ( Array.isArray(text) ) {
				let len = 0;
				const out = [];

				for(const token of text) {
					if ( ! token )
						continue;

					let weight;
					if ( token[Weight] )
						weight = token[Weight];
					else if ( typeof token === 'string' )
						weight = token.length;
					else
						weight = token.content.length;

					len += weight;
					if ( len <= 280 ) {
						out.push(token);
						continue;

					} else if ( typeof token === 'string' )
						out.push(truncate(token, weight - (len - 280), 15, '…', false, false));

					truncated = true;
					break;
				}

				text = out;
			}

			if ( truncated ) {
				if ( ! Array.isArray(text) )
					text = [text];

				text.push(' ');
				text.push(linkToken(data.url, 'Show More', {tooltip: false}));
			}
		}

		if ( fragment && fragments )
			fragments[fragment] = text;

		let raw_media = data.media?.all,
			media = null;

		if ( raw_media?.length > 0 ) {
			if ( raw_media?.length > 4 )
				raw_media = raw_media.slice(0, 4);

			//console.log('media', raw_media);

			media = [];

			for(const entity of raw_media) {
				const type = entity.type;
				let token;

				if ( type === 'gif' )
					token = overlayToken(
						{
							type: 'player',
							autoplay: true,
							loop: true,
							silent: true,
							poster: entity.thumbnail_url,
							sources: [
								{type: entity.format, src: entity.url}
							]
						},
						{
							'bottom-left': 'GIF'
						}
					);

				else if ( type === 'video' )
					token = {
						type: 'player',
						autoplay: true,
						silent: false,
						content: overlayToken(
							imageToken(
								entity.thumbnail_url
							),
							{
								center: styleToken({size: '1'}, iconToken('play')),
								'bottom-right': formatToken('duration', Math.round(entity.duration))
							}
						),
						sources: [
							{type: entity.format, src: entity.url}
						]
					};

				else if ( type === 'photo' )
					token = linkToken(`${entity.url}:large`, imageToken(entity.url), {tooltip: false});

				else
					continue;

				media.push(token);
			}

			// Swap the second and third images because we lay them out
			// differently than Twitter does.
			/*if ( media.length === 4 ) {
				let temp = media[1];
				media[1] = media[2];
				media[2] = temp;
			}*/

			media = media.length > 0
				? conditionalToken(true, data.possibly_sensitive ?? undefined, galleryToken(...media))
				: null;
		}

		let poll = null;
		if ( data.poll && Array.isArray(data.poll.choices) ) {
			const options = [];

			for(const opt of data.poll.choices) {
				options.push({
					name: [
						formatToken('number', opt.percentage / 100, 'percent'),
						' ',
						opt.label
					],
					value: boxToken({
						border: true,
						'mg-b': 'small',
						rounding: 2,
						background: 'text',
						width: `${opt.percentage}%`,
						height: '0.5em'
					})
				});
			}

			const ends_at = dayjs(data.poll.ends_at).valueOf(),
				now = Date.now(),
				ended = ends_at <= now;

			if ( options.length > 0 )
				poll = boxToken({wrap: 'pre-wrap','mg-y': 'small', border: true, rounding: 2, 'pd': 'small'}, [
					ended
						? i18nToken('poll-closed', 'This poll has ended.')
						: i18nToken('poll-running', 'This poll is active.'),
					{type: 'fieldset', fields: options},
					i18nToken('poll-votes', '{count,plural,one {# Vote} other {# Votes}}', {
						count: data.poll.total_votes ?? 0
					})
				]);
		}

		return [
			replies ? styleToken({color: 'alt-2', size: '7'}, replies) : null,
			boxToken({wrap: 'pre-wrap', 'mg-y': 'small', lines: 10}, fragment ? refToken(fragment) : text),
			poll,
			media,
		];
	}

	renderUserHeader(user, one_line = false, subtitle = null, extra = null, background = null) {
		let badges = null;

		if ( ! this.service.opts.disable_tags ) {
			badges = [];

			if ( user.verified )
				badges.push('verified');
			if ( user.is_translator )
				badges.push('translator');
			if ( user.protected )
				badges.push('protected');

			badges = badges.length ? badges.map(name => ({
				type: 'tag', tag: 'span',
				class: `ffz--twitter-badge ffz--twitter-badge__${name}`
			})) : null;
		}

		const compact = one_line && subtitle == null && extra == null;

		let builder = this.builder()
			.setLogo(user.avatar_url, {rounding: compact ? -1 : 3});

			if ( compact )
			builder = builder.setCompactHeader();

		if ( one_line )
			return builder
				.setTitle(linkToken(`https://twitter.com/${user.screen_name}`, [
					styleToken({color: 'base'}, user.name),
					badges,
					' ',
					styleToken({weight: 'regular', color: 'alt-2'}, `@${user.screen_name}`)
				], {tooltip: false}))
				.setSubtitle(subtitle)
				.setExtra(extra)
				.setBackground(background);

		return builder
			.setTitle(linkToken(
				`https://twitter.com/${user.screen_name}`, [styleToken({color: 'base'}, user.name), badges], {tooltip: false}
			))
			.setSubtitle(linkToken(
				`https://twitter.com/${user.screen_name}`, styleToken({color: 'alt-2'}, `@${user.screen_name}`), {tooltip: false}
			))
			.setExtra(extra)
			.setBackground(background);
	}

}


FxTwitter.hosts = [
	'twitter.com',
	'x.com',
	'fxtwitter.com',
	'vxtwitter.com',
	'twittpr.com',
	'pxtwitter.com',
	'fixupx.com',
	'nitter.net'
];

FxTwitter.examples = [
	{title: 'Profile', url: 'https://twitter.com/frankerfacez'},
	{title: 'Tweet', url: 'https://twitter.com/FrankerFaceZ/status/1240717057630625792'},
	{title: 'Quote Tweet', url: 'https://twitter.com/Wario64/status/1704992045688127907'},
	{title: 'Reply Tweet', url: 'https://twitter.com/SirStendec/status/1702849608928436575'},
	{title: 'Tweet with GIF', url: 'https://twitter.com/LucyLavend/status/1543166082223063041'},
	{title: 'Tweet with Video', url: 'https://twitter.com/talesoftheshire/status/1704981569222689100'},
	{title: 'Tweet with Photo + Video', url: 'https://twitter.com/lilillililXX/status/1578611365513547776'},
	{title: 'Quote Tweet with Long', url: 'https://twitter.com/zemnmez/status/1704949538518397177'},
	{title: 'Quote with Four Picture Meme', url: 'https://twitter.com/soapotd/status/1578452975697072128'}
];
