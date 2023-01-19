'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import dayjs from 'dayjs';
import cheerio from 'cheerio';
import {decode as decodeEntities} from 'html-entities';

import {formatToken, iconToken, i18nToken, linkToken, styleToken, conditionalToken, galleryToken, overlayToken, imageToken, boxToken} from '../builder';


const API_BASE = 'https://api.twitter.com/1.1';
const BAD_URLS = ['i', 'about', 'privacy', 'settings', 'tos'];
const PROFILE_ACTIONS = ['with_replies', 'media', 'following', 'followers', 'likes'];

//const VIDEO_SIZE = /\/vid\/(\d+)x(\d+)\//;


function mergeEntities(entities, extended) {
	if ( ! extended )
		return entities;

	for (const [type, list] of Object.entries(extended)) {
		const existing = entities[type] = entities[type] || [],
			by_id = {};

		for (const entity of existing)
			by_id[entity.id_str] = entity;

		for (const entity of list) {
			if ( by_id[entity.id_str] )
				Object.assign(by_id[entity.id_str], entity);
			else {
				existing.push(entity);
				by_id[entity.id_str] = entity;
			}
		}
	}

	return entities;
}


function flattenEntities(entities) {
	const out = [];
	for (const [type, list] of Object.entries(entities)) {
		if ( ! Array.isArray(list) )
			continue;

		for (const entity of list)
			out.push({type, entity});
	}

	return out;
}

function sortEntities(entities) {
	return entities.sort((a, b) => a.entity.indices[0] - b.entity.indices[0]);
}


function tokenizeTweet(text, entities, [start, end]) {
	if ( ! Array.isArray(entities) )
		entities = sortEntities(flattenEntities(entities));

	const replies = [],
		media = [],
		tokens = [];

	let idx = 0;

	// We need to split our text up into individual characters to ensure
	// that we handle unicode correctly, since a lot of unicode codepoints
	// are multiple characters in JS strings. Fortunately, Array.from
	// handles all of that correctly.

	// Also, we can't unescape the HTML entities until after this step because
	// indicies are set up for the HTML entities~
	text = [...text];

	for (const {type, entity} of entities) {
		const [e_start, e_end] = entity.indices;

		if ( e_start > idx && e_start > start ) {
			tokens.push(decodeEntities(text.slice(Math.max(start, idx), e_start).join('')));
			idx = e_start;
		}

		if ( type === 'user_mentions' ) {
			const tag = linkToken(`https://twitter.com/${entity.screen_name}`, `@${entity.screen_name}`);
			if ( e_end < start ) {
				replies.push(tag);
				idx = e_end;
			} else if ( e_start < end ) {
				tokens.push(tag);
				idx = e_end;
			} else
				break;

		} else if ( type === 'media' ) {
			if ( entity.type === 'photo' || entity.type === 'animated_gif' || entity.type === 'video' ) {
				media.push(entity);
				idx = e_end;
			} else if ( e_start < end ) {
				tokens.push(linkToken(entity.expanded_url || entity.url, entity.display_url));
				idx = e_end;
			} else
				break;

		} else if ( e_start < end ) {
			if ( type === 'urls' )
				tokens.push(linkToken(entity.expanded_url || entity.url, entity.display_url));

			else if ( type === 'hashtags' )
				tokens.push(linkToken(
					`https://twitter.com/search?q=${encodeURIComponent(`#${entity.text}`)}`,
					`#${entity.text}`
				));

			else if ( type === 'symbols' )
				tokens.push(linkToken(
					`https://twitter.com/search?q=${encodeURIComponent(`$${entity.text}`)}`,
					`$${entity.text}`
				));

			else
				tokens.push(decodeEntities(text.slice(e_start, e_end).join('')));

			idx = e_end;

		} else
			break;
	}

	if ( idx < end )
		tokens.push(decodeEntities(text.slice(idx, end).join('')));

	return {
		tokens,
		replies,
		media
	}
}


export default class Twitter extends Resolver {

	transformURL(url, ctx) {
		if ( ! this.service.opts.twitter_api?.key )
			return UseMetadata;

		if ( url.hostname !== 'twitter.com' && url.hostname !== 'www.twitter.com' && url.hostname !== 'm.twitter.com' )
			return UseMetadata;

		const parts = url.pathname.split('/');
		if ( parts[1] === 'i' && parts[2] === 'web' && parts[3] === 'status' )
			parts.shift();

		const username = parts[1],
			action = parts[2];

		if ( BAD_URLS.includes(username) )
			return UseMetadata;

		let token = this.service.opts.twitter_api?.key;
		if ( Array.isArray(token) )
			token = token[Math.floor(Math.random() * token.length)];

		ctx.headers = {
			Authorization: `Bearer ${token}`
		};

		if ( action === 'status' ) {
			ctx.mode = 'tweet';
			const tweet_id = ctx.tweet_id = parts[3];
			ctx.cache_key = `tweet-${tweet_id}`;
			return `${API_BASE}/statuses/show.json?id=${tweet_id}&tweet_mode=extended`;

		} else if ( ! action || PROFILE_ACTIONS.includes(action) ) {
			ctx.mode = 'profile';
			ctx.cache_key = `twitter-user-${username}`;
			return `${API_BASE}/users/show.json?screen_name=${username}`;
		}

		return UseMetadata;
	}


	processBody(data, mode, ctx) {
		if ( ! data || mode !== 'json' )
			return null;

		if ( ctx.mode === 'tweet' )
			return this.processTweet(data, ctx);

		const tokens = tokenizeTweet(data.description, data.entities.description, [0, data.description.length]),
			joined = dayjs(data.created_at);

		const link = data.entities?.url?.urls?.[0];

		console.log('data', data);

		return {
			v: 5,
			accent: '#1da1f2',

			short: this.renderUserHeader(
				data, true,
				tokens.tokens,
				this.builder()
					.add(iconToken('twitter'))
					.addI18n(
						'embed.twitter.profile-line',
						'{tweets,plural,one {# Tweet} other {# Tweets}} • {following,number} Following • {followers,number} Followers • Joined {joined,date}', {
							joined,
							tweets: data.statuses_count,
							following: data.friends_count,
							followers: data.followers_count
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
					data.profile_banner_url ? imageToken(
						data.profile_banner_url,
						{
							aspect: 16/9
						}
					) : null
				))
				.add(this.renderBody(data, tokens))
				.addField(i18nToken('embed.twitter.following', 'Following'), formatToken('number', data.friends_count || 0), true)
				.addField(i18nToken('embed.twitter.tweets', 'Tweets'), formatToken('number', data.statuses_count || 0), true)
				.addField(i18nToken('embed.twitter.likes', 'Likes'), formatToken('number', data.favourites_count || 0), true)
		}
	}

	processTweet(data) {
		data.entities = mergeEntities(data.entities, data.extended_entities);

		const time = dayjs(data.created_at);
		const tokens = tokenizeTweet(data.full_text, data.entities, data.display_text_range);

		let source;
		try {
			source = cheerio.load(data.source).text();
		} catch (err) { /* no-op */ }

		const quote_link = data.quoted_status_permalink?.expanded;
		let quoted;
		if ( data.quoted_status ) {
			quoted = {
				type: 'link', embed: true, interactive: true, tooltip: false, url: quote_link, content: [
					this.renderUserHeader(data.quoted_status.user, true),
					this.renderBody(data.quoted_status)
				]
			};
		}

		const i18n_key = `embed.twitter.${tokens.replies.length ? 'replied' : 'tweeted'}`,
			i18n_phrase = tokens.replies.length ? 'replied: {tweet}' : 'tweeted: {tweet}';

		return {
			v: 5,
			accent: '#1da1f2',

			short: this.renderUserHeader(
				data.user, true,
				this.builder().addI18n(i18n_key, i18n_phrase, {
					tweet: tokens.tokens
				}),
				this.builder()
					.addIcon('twitter')
					.addI18n(
						'embed.twitter.info-line',
						'{created,time} • {created,date} • {retweets,plural,one {# Retweet} other {# Retweets}} • {likes,plural,one {# Like} other {# Likes}}', {
							created: time,
							retweets: data.retweet_count,
							likes: data.favorite_count
						}
					)
			),

			full: this.builder()
				.add(this.renderUserHeader(data.user))
				.add(this.renderBody(data, tokens, quote_link))
				.add(quoted)
				.addField(i18nToken('embed.twitter.retweets', 'Retweets'), formatToken('number', data.retweet_count || 0), true)
				.addField(i18nToken('embed.twitter.likes', 'Likes'), formatToken('number', data.favorite_count || 0), true)
				.setFooter(
					null,
					[
						iconToken('twitter'),
						'Twitter • ',
						formatToken('time', time),
						' • ',
						formatToken('date', time),
						' • ',
						source
					]
				)
		}
	}

	renderUserHeader(user, one_line = false, subtitle = null, extra = null, background = null) {
		let badges = [];
		if ( user.verified )
			badges.push('verified');
		else if ( user.is_translator )
			badges.push('translator');
		else if ( user.protected )
			badges.push('protected');

		badges = badges.length ? badges.map(name => ({
			type: 'tag', tag: 'span',
			class: `ffz--twitter-badge ffz--twitter-badge__${name}`
		})) : null;

		const compact = one_line && subtitle == null && extra == null;

		let builder = this.builder()
			.setLogo(user.profile_image_url_https, {rounding: compact ? -1 : 3});

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

	renderBody(data, tokens, quote_link) {
		if ( ! tokens )
			tokens = tokenizeTweet(data.full_text, mergeEntities(data.entities, data.extended_entities), data.display_text_range);

		if ( ! tokens )
			return;

		let replies = tokens.replies;
		if ( replies.length > 4 )
			replies = i18nToken(
				'embed.twitter.reply-and-others',
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
				'embed.twitter.reply-list',
				'Replying to {names}',
				{names: new_replies}
			);
		} else
			replies = null;

		let raw_media = tokens.media,
			media;
		if ( raw_media.length > 0 ) {
			if ( raw_media.length > 4 )
				raw_media = raw_media.slice(0, 4);

			const type = raw_media[0].type;
			if ( type === 'animated_gif' ) {
				const entity = raw_media[0],
					variant = entity?.video_info?.variants?.[0];

				if ( variant )
					media = [
						{
							type: 'tag', tag: 'video', attrs: {muted: true, loop: true, autoplay: true, poster: entity.media_url_https}, content: [{type: 'tag', tag: 'source', attrs: {src: variant.url, type: variant.content_type}}]
						}
					];
			} else if ( type === 'video' ) {
				const entity = raw_media[0];
				/* variants = entity?.video_info?.variants,
					sources = [];

				if ( variants ) {
					for (const variant of variants) {
						const match = VIDEO_SIZE.exec(variant.url),
							source = {
								type: 'tag', tag: 'source',
								attrs: {type: variant.content_type, src: variant.url}
							};

						if ( match ) {
							source.attrs['data-width'] = parseInt(match[1], 10);
							source.attrs['data-height'] = parseInt(match[2], 10);
						}

						sources.push(source);
					}

					sources.sort((a, b) => b.attrs['data-width'] - a.attrs['data-width']);

					let first = true;
					for (const source of sources) {
						if ( ! source.attrs['data-width'] )
							continue;

						if ( ! first  ) {
							source.attrs.media = `all and (max-width: ${source.attrs['data-width']}px)`
						}

						first = false;
					}
				}

				if ( sources.length )
					media = [
						{
							type: 'tag', tag: 'video', attrs: {controls: true, poster: entity.media_url_https}, content: sources
						}
					];*/

				if ( entity?.video_info )
					media = [
						overlayToken(
							imageToken(entity.media_url_https),
							{
								center: styleToken({size: '1'}, iconToken('play')),
								'bottom-right': formatToken('duration', Math.round(entity.video_info.duration_millis / 1000))
							}
						)
					];
			}

			if ( ! media )
				media = raw_media.map(entity => linkToken(`${entity.media_url_https}:large`, imageToken(`${entity.media_url_https}:small`, {sfw: false})));

			media = conditionalToken(true, true, galleryToken(...media));
		}

		let filtered_tokens = tokens.tokens;
		if ( quote_link )
			filtered_tokens = filtered_tokens.filter(token => token.type === 'link' ? token.href !== quote_link : true);

		if ( filtered_tokens[0] && typeof filtered_tokens[0] === 'string' && filtered_tokens[0].startsWith(' ') )
			filtered_tokens[0] = filtered_tokens[0].trimLeft();

		return [
			styleToken({color: 'alt-2', size: '7'}, replies),
			boxToken({wrap: 'pre-wrap', 'mg-y': 'small', lines: 10}, filtered_tokens),
			media
		];
	}

}

Twitter.hosts = ['twitter.com'];
Twitter.examples = [
	{title: 'Profile', url: 'https://twitter.com/frankerfacez'},
	{title: 'Tweet', url: 'https://twitter.com/FrankerFaceZ/status/1240717057630625792'}
];
