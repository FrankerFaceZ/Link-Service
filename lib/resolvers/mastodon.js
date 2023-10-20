'use strict';

import Resolver from '../resolver';
import { Redirect, UseMetadata } from '../results';
import dayjs from 'dayjs';
import { load as cheerioLoad } from 'cheerio';
import { LRUCache } from 'mnemonist';

import { formatToken, iconToken, i18nToken, linkToken, styleToken, conditionalToken, galleryToken, overlayToken, imageToken, boxToken, refToken } from '../builder';

const STATUS_URL_ONE = /^\/users\/([^\/]+)\/statuses\/(\d+)$/i;
const STATUS_URL_TWO = /^\/@([^\/@]+)(?:@([^\/@]+))?\/(\d+)$/i;

const ELK_STATUS_URL = /^\/([^\/]+)\/@([^\/@]+)(?:@([^\/@]+))?\/(\d+)$/i;
const ELK_USER_URL   = /^\/([^\/]+)\/@([^\/@]+)(?:@([^\/@]+))?$/i;

const USER_URL_ONE = /^\/@([^\/@]+(?:@[^\/@]+)?)\/?$/i;
const USER_URL_TWO = /^\/users\/([^\/]+)\/?$/i;

const EMOJI_REPLACER = /:(\w+):/g;

const hasOwn = Object.prototype.hasOwnProperty;

function isValidEmbedHost(url) {
	if ( url.hostname === 'www.youtube.com' )
		return true;

	if ( url.hostname === 'w.soundcloud.com' )
		return true;

	return false;
}

const DummyCache = {
	cache: new LRUCache(50),

	get(key, options) {
		let result = DummyCache.cache.get(key);
		if (!result || (result.at < Date.now() - (options?.ttl ?? 3600000)))
			return {hit: false};

		return {hit: true, value: result.value};
	},

	set(key, value, options) {
		DummyCache.cache.set(key, {
			at: Date.now(),
			value: value
		});
	}
}

function parseHTML(html) {
	const doc = cheerioLoad(html),
		body = doc("body").first();

	if ( ! body || body.length !== 1 )
		return null;

	return body[0];
}

function tokenizeNode(node) {
	if (! node)
		return null;

	if (Array.isArray(node)) {
		const result = [];
		let want_line = false;

		for(const child of node) {
			const val = tokenizeNode(child);
			if (val) {
				if (want_line) {
					result.push('\n\n');
					want_line = false;
				}
				if (Array.isArray(val)) {
					for(const v of val)
						result.push(v);
				} else
					result.push(val);
			}

			want_line = want_line || (child.type == 'tag' && child.name == 'p');
		}

		return result;
	}

	if (node.type === 'text')
		return node.data;

	if (node.type !== 'tag') {
		console.log('unknown node type', node);
		return null;
	}

	const tag = node.name;
	if (tag === 'body') {
		// Body.
		return tokenizeNode(node.children);
	}

	if (tag === 'a') {
		// Link
		let ret = tokenizeNode(node.children);
		if (!ret)
			return ret;

		return linkToken(
			node.attribs.href,
			ret
		);

	} else if (tag === 'span') {
		// Span
		const cls = node.attribs?.class;
		if (cls === 'invisible')
			return null;

		let ret = tokenizeNode(node.children);
		if (!ret)
			return null;

		if (cls === 'ellipsis') {
			if (Array.isArray(ret))
				ret.push('…');
			else
				ret = [ret, '…'];
		}

		return ret;

	} else if (tag === 'p') {
		// Paragraph
		return tokenizeNode(node.children);

	} else if (tag === 'br') {
		return '\n';

	} else {
		// ???
		console.log('disallowed tag', tag);
		return tokenizeNode(node.children);
	}
}

function replaceEmoji(token, emoji, fragments) {
	if (fragments == null || ! token)
		return token;

	if (Array.isArray(token)) {
		const out = [];

		for(const tok of token) {
			let ret = replaceEmoji(tok, emoji, fragments);
			if (Array.isArray(ret)) {
				for(const r of ret)
					out.push(r);
			} else if (ret)
				out.push(ret);
		}

		return out;
	}

	if (token.content) {
		token.content = replaceEmoji(token.content, emoji, fragments);
		return token;
	}

	if (typeof token !== 'string')
		return token;

	const out = [];

	let idx = 0;
	let match;
	while(match = EMOJI_REPLACER.exec(token)) {
		const code = match[1];
		if (!hasOwn.call(emoji, code))
			continue;

		if (match.index > idx)
			out.push(token.slice(idx, match.index));

		idx = match.index + match[0].length;

		const fname = `em_${code}`;
		if (!hasOwn.call(fragments, fname))
			fragments[fname] = imageToken(
				emoji[code],
				{
					title: match[0],
					height: '1.3em'
				}
			);

		out.push(refToken(fname));
	}

	if (idx < token.length)
		out.push(token.slice(idx));

	return out.length > 1 ? out : out[0];

}

export default class Mastodon extends Resolver {

	handles(host) {
		return true;
	}

	fetchJSON(url, options) {
		return this.fetch(url, options)
			.then(r => r.ok ? r.json() : null)
			.catch(() => null);
	}

	async standardizeMastodonEmoji(emoji) {
		if (!Array.isArray(emoji) || emoji.length < 1)
			return null;

		const obj = {};
		for(const emo of emoji) {
			obj[emo.shortcode] = await this.proxyImage(emo.url, '32,fit');
		}
		return obj;
	}

	async standardizeActivityEmoji(tags) {
		if (!Array.isArray(tags) || tags.length < 1)
			return null;

		const obj = {};
		for(const tag of tags) {
			if (tag?.type === 'Emoji' && tag.icon?.type === 'Image' && tag.icon.url && tag.name) {
				obj[tag.name.slice(1, -1)] = await this.proxyImage(tag.icon.url, '32,fit');
			}
		}
		return obj;
	}

	async fetchActivityUser(url) {
		const cache = this.service.opts.cache ?? DummyCache,
			ckey = `fed-actuser-${url}`;

		let cached = cache.get(ckey);
		if ( cached.hit )
			return cached.value;

		const raw = await this.fetchJSON(url, {
			headers: {
				Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
			}
		});

		let result;

		if (raw && (raw.type === 'Person' || raw.type === 'Service'))
			result = {
				id: raw.id,
				bot: raw.type === 'Service',
				url: raw.url,
				avatar: raw.icon?.type === 'Image' ? raw.icon.url : null,
				display_name: raw.name,
				username: raw.preferredUsername,
				emojis: await this.standardizeActivityEmoji(raw.tag)
			};

		cache.set(ckey, result);
		return result;
	}

	async fetchSiteStyle(host) {
		const cache = this.service.opts.cache ?? DummyCache,
			ckey = `fed-meta-${host}`;

		let cached = cache.get(ckey);
		if ( cached.hit )
			return cached.value;

		const raw = await fetch(`https://${host}/`)
			.then(r => r.ok ? r.text() : null)
			.then(r => cheerioLoad(r))
			.catch(err => {
				//console.error(err);
				return null;
			});

		let data;

		if ( raw ) {
			data = {};

			let tags = Array.from(raw("meta"));

			for(const tag of tags) {
				const attribs = tag.attribs,
					key = attribs.property ?? attribs.name ?? attribs.itemprop;

				let content = attribs.content;

				if ( key === 'theme-color' )
					data.accent = content;

				if ( key === 'og:site_name' )
					data.name = content;
			}

			tags = Array.from(raw("link"));
			for(const tag of tags) {
				const attribs = tag.attribs,
					key = attribs.rel;

				let content = attribs.href;

				if ( key === 'icon' )
					data.icon = content;
			}
		}

		cache.set(ckey, data);
		return data;
	}

	async isFediverse(host) {
		if (host === 'elk.zone')
			return 'elk';

		const cache = this.service.opts.cache ?? DummyCache,
			ckey = `fed-check-${host}`;

		let resp = cache.get(ckey);
		if (resp.hit)
			return resp.value;

		// Get the node info.
		resp = await this.fetchJSON(`https://${host}/.well-known/nodeinfo`);
		if (! Array.isArray(resp?.links)) {
			cache.set(ckey, false);
			return false;
		}

		// Find the relevant link.
		let link = null;
		for(const l of resp.links) {
			if (l?.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.0') {
				link = l.href;
				break;
			}
		}

		// No relevant link? Not mastodon. Not the same host? You get it.
		if (!link || new URL(link).host !== host) {
			cache.set(ckey, false);
			return false;
		}

		// Hit up the new link for details.
		resp = await this.fetchJSON(link);

		// If we don't have a software name and/or don't have activitypub,
		// then we don't support this server.
		if (! resp?.version || ! resp.software || ! resp.software.name ||
			! resp.protocols || ! resp.protocols.includes('activitypub') ) {
			cache.set(ckey, false);
			return false;
		}

		// Cache the server name and return it.
		cache.set(ckey, resp.software.name);
		return resp.software.name;
	}

	async transformURL(url, ctx) {
		// If we can't cache our server hits, this is too heavy.
		//if ( ! this.service.opts.cache )
		//	return UseMetadata;

		const type = await this.isFediverse(url.host);
		if (!type)
			return UseMetadata;

		// Elk Handling
		if (type === 'elk') {
			// We want URLs that include a host as well as a user and possibly
			// a status.
			let match = ELK_STATUS_URL.exec(url.pathname);
			if (match)
				return new Redirect(`https://${match[1]}/@${match[2]}${match[3] && `@${match[3]}`}/${match[4]}`);

			match = ELK_USER_URL.exec(url.pathname);
			if (match)
				return new Redirect(`https://${match[1]}/@${match[2]}${match[3] && `@${match[3]}`}`);

			return UseMetadata;
		}

		// Mastodon Handling
		if (type === 'mastodon') {
			// Post
			let status = null;
			let match = STATUS_URL_ONE.exec(url.pathname);
			if (match)
				status = match[2];
			else {
				match = STATUS_URL_TWO.exec(url.pathname);
				if (match)
					status = match[3];
			}

			if (status) {
				ctx.mode = 'toot';
				return `https://${url.host}/api/v1/statuses/${status}`;
			}

			// User
			let user = null;
			match = USER_URL_ONE.exec(url.pathname) ?? USER_URL_TWO.exec(url.pathname);
			if (match)
				user = match[1];

			if (user) {
				ctx.mode = 'mstd-user';
				return `https://${url.host}/api/v1/accounts/lookup?acct=${user}`;
			}
		}

		// Generic ActivityPub Handling
		ctx.mode = 'activity';
		ctx.parse = 'json';
		ctx.software = type;
		ctx.headers = {
			Accept: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
		};
		return url;
	}

	processBody(data, mode, ctx) {
		if ( ! data || mode !== 'json' )
			return UseMetadata;

		if ( ctx.mode === 'toot' )
			return this.processToot(data, ctx);

		if ( ctx.mode === 'mstd-user' )
			return this.processMastodonUser(data, ctx);

		if ( ctx.mode === 'activity' )
			return this.processActivity(data, ctx);
	}

	async processMastodonUser(data, ctx) {
		if ( ! data || ! data.id || ! data.username )
			return UseMetadata;

		const fragments = {},

			joined = dayjs(data.created_at),
			site = await this.fetchSiteStyle(ctx.url.host);

		let body = tokenizeNode(parseHTML(data.note));
		let has_emoji = false;

		if ( Array.isArray(data.emojis) && data.emojis.length > 0 ) {
			data.emojis = await this.standardizeMastodonEmoji(data.emojis);
			has_emoji = true;

			body = replaceEmoji(body, data.emojis, fragments);
		}

		fragments.body = body;

		const fields = [];

		if ( Array.isArray(data.fields) )
			for(const field of data.fields) {
				if ( ! field.name || ! field.value )
					continue;

				let fkey = field.name;
				let fbody = tokenizeNode(parseHTML(field.value));

				if ( has_emoji ) {
					fkey = replaceEmoji(fkey, data.emojis, fragments);
					fbody = replaceEmoji(fbody, data.emojis, fragments);
				}

				fields.push({
					name: fkey,
					value: fbody,
					icon: field.verified_at ? iconToken('verified') : null
				});
			}

		const field_table = fields.length > 0
			? boxToken({'mg-y': 'small', 'pd': 'small', border: true}, {
				type: 'fieldset',
				fields
			})
			: null;

		let background = null;
		if ( data.header && ! data.header.includes('missing') )
			background = imageToken(
				await this.proxyImage(data.header, '320x180,fit'),
				{
					aspect: 16/9
				}
			);

		return {
			v: 6,

			accent: site?.accent,

			fragments,

			short: await this.renderUserHeader(
				data, true, fragments,
				refToken('body'),
				this.builder()
					.addIcon('mastodon')
					.addI18n(
						'embed.mastodon.profile-line',
						'{posts,plural,one {# Post} other {# Posts}} • {following,number} Following • {followers,number} Followers • Joined {joined,date}', {
							joined,
							posts: data.statuses_count ?? 0,
							following: data.following_count ?? 0,
							followers: data.followers_count ?? 0
						}
					)
			),

			full: this.builder()
				.add(await this.renderUserHeader(
					data, true, fragments,
					this.builder()
						.add([iconToken('calendar'), ' ', i18nToken('embed.mastodon.joined', 'Joined {when,date}', {when: joined})]),
					null,
					background
				))
				.add(await this.renderBody(data, false))
				.add(field_table)
				//.add(header)
				.addField(i18nToken('embed.mastodon.statuses', 'Posts'), formatToken('number', data.statuses_count ?? 0), true)
				.addField(i18nToken('embed.mastodon.following', 'Following'), formatToken('number', data.following_count ?? 0), true)
				.addField(i18nToken('embed.mastodon.followers', 'Followers'), formatToken('number', data.followers_count ?? 0), true)
				.setFooter(
					null,
					iconToken('mastodon')
				)
		};
	}

	processActivity(data, ctx) {
		// Validate the object we received.
		if ( ! data || ! Array.isArray(data['@context']) || ! data['@context'].includes('https://www.w3.org/ns/activitystreams') )
			return UseMetadata;

		if (data.type === 'Person' || data.type === 'Service')
			return this.processActivityUser(data, ctx);

		if (data.type === 'Note')
			return this.processActivityNote(data, ctx);

		console.log('unknown activity type', data.type);
		return UseMetadata;
	}


	async processActivityUser(data, ctx) {

		const fragments = {},

			emoji = await this.standardizeActivityEmoji(data.tag),
			site = await this.fetchSiteStyle(ctx.url.host),

			user = {
				id: data.id,
				bot: data.type === 'Service',
				url: data.url,
				avatar: data.icon?.type === 'Image' ? data.icon.url : null,
				display_name: data.name,
				username: data.preferredUsername,
				emojis: emoji
			};

		let body = tokenizeNode(parseHTML(data.summary));
		if ( emoji )
			body = replaceEmoji(body, emoji, fragments);

		fragments.body = body;

		const site_name = site?.name
			? [
				styleToken({weight: 'semibold'}, site.name),
				' (',
				ctx.url.host,
				')'
			]
			: ctx.url.host;

		fragments.footer = [
			linkToken(`${ctx.url.protocol}//${ctx.url.host}`, site_name, {tooltip: false, no_color: true})
		];

		const fields = [];

		if ( Array.isArray(data.attachment) )
			for(const field of data.attachment) {
				if ( field.type !== 'PropertyValue' || ! field.name || ! field.value )
					continue;

				let fkey = field.name;
				let fbody = tokenizeNode(parseHTML(field.value));

				if ( emoji ) {
					fkey = replaceEmoji(fkey, emoji, fragments);
					fbody = replaceEmoji(fbody, emoji, fragments);
				}

				fields.push({
					name: fkey,
					value: fbody
				});
			}

		const field_table = fields.length > 0
			? boxToken({'mg-y': 'small', 'pd': 'small', border: true}, {
				type: 'fieldset',
				fields
			})
			: null;

		let background = null;
		if ( data.image?.type === 'Image' && data.image.url )
			background = imageToken(
				await this.proxyImage(data.image.url, '320x180,fit'),
				{
					aspect: 16/9
				}
			);

		const icon_proxied = await this.proxyImage(site.icon, '32,fit');

		return {
			v: 6,

			accent: site?.accent,

			fragments,

			short: await this.renderUserHeader(
				user, true, fragments,
				refToken('body'),
				site?.icon
					? [
						imageToken(icon_proxied, {height: '1.3em'}),
						' ',
						refToken('footer')
					]
					: refToken('footer')
			),

			full: this.builder()
				.add(await this.renderUserHeader(
					user, false, fragments, null, null, background
				))
				.add(await this.renderBody(data, false))
				.add(field_table)
				.setFooter(
					null,
					refToken('footer'),
					site?.icon ? icon_proxied : null
				)
		};
	}


	async processActivityNote(data, ctx) {
		// Load the user and convert it to a format we like.
		const [user, site] = await Promise.all([
			this.fetchActivityUser(data.attributedTo),
			this.fetchSiteStyle(ctx.url.host)
		]);

		const fragments = {},
			time = dayjs(data.published);

		// Convert attachments to a format we like.
		if ( Array.isArray(data.attachment)) {
			const media = data.media_attachments = [];
			for(const entry of data.attachment) {
				if (entry?.type !== 'Document')
					continue;

				if (entry.mediaType.startsWith('image/')) {
					media.push({
						type: 'image',
						preview_url: entry.url,
						url: entry.url
					});
				}
			}
		}

		let body = tokenizeNode(parseHTML(data.content));
		if (Array.isArray(data.tag) && data.tag.length > 0)
			body = replaceEmoji(body, await this.standardizeActivityEmoji(data.tag), fragments);

		fragments.body = body;

		const site_name = site?.name
		? [
			styleToken({weight: 'semibold'}, site.name),
			' (',
			ctx.url.host,
			')'
		]
		: ctx.url.host;

		fragments.footer = [
			linkToken(`${ctx.url.protocol}//${ctx.url.host}`, site_name, {tooltip: false, no_color: true}),
			' • ',
			formatToken('time', time),
			' • ',
			formatToken('date', time)
		];

		const icon_proxied = await this.proxyImage(site.icon, '32,fit');

		return {
			v: 6,

			accent: site?.accent,

			fragments,

			short: await this.renderUserHeader(
				user, true, fragments,
				[
					styleToken({color: 'alt'}, i18nToken('embed.mastodon.posted', 'posted:')),
					' ',
					refToken('body')
				],
				site?.icon
					? [
						imageToken(icon_proxied, {height: '1.3em'}),
						' ',
						refToken('footer')
					]
					: refToken('footer')
			),

			full: this.builder()
				.add(await this.renderUserHeader(user, false, fragments))
				.add(await this.renderBody(data, false))
				.setFooter(
					null,
					refToken('footer'),
					site?.icon ? icon_proxied : null
				)
		};
	}

	async processToot(data) {
		const fragments = {},
			time = dayjs(data.created_at);

		let warning;
		if (data.spoiler_text?.length > 0)
			warning = [
				styleToken({weight: 'bold'}, i18nToken('embed.mastodon.cw', 'Content Warning:')),
				' ',
				data.spoiler_text
			];

		let body = tokenizeNode(parseHTML(data.content));
		if (Array.isArray(data.emojis) && data.emojis.length > 0)
			body = replaceEmoji(body, await this.standardizeMastodonEmoji(data.emojis), fragments);

		data.account.emojis = await this.standardizeMastodonEmoji(data.account.emojis);

		fragments.warning = warning;
		fragments.body = body;

		return {
			v: 5,

			fragments,

			short: await this.renderUserHeader(
				data.account, true, fragments,
				[
					styleToken({color: 'alt'}, data.in_reply_to_id ? i18nToken('embed.mastodon.replied', 'replied:') : i18nToken('embed.mastodon.posted', 'posted:')),
					' ',
					warning ? refToken('warning') : refToken('body'),
				],
				this.builder()
					.addIcon('mastodon')
					.addI18n(
						'embed.mastodon.info-line',
						'{created,time} • {created,date} • {reblogs,plural,one {# Reblog} other {# Reblogs}} • {favorites,plural,one {# Favorite} other {# Favorites}}', {
							created: time,
							replies: data.replies_count ?? 0,
							reblogs: data.reblogs_count ?? 0,
							favorites: data.favourites_count ?? 0
						}
					)
			),

			full: this.builder()
				.add(await this.renderUserHeader(data.account, false, fragments))
				.add(await this.renderBody(data, warning ? true : false))
				.addField(i18nToken('embed.mastodon.replies', 'Replies'), formatToken('number', data.replies_count ?? 0), true)
				.addField(i18nToken('embed.mastodon.reblogs', 'Reblogs'), formatToken('number', data.reblogs_count ?? 0), true)
				.addField(i18nToken('embed.mastodon.favorites', 'Favorites'), formatToken('number', data.favourites_count ?? 0), true)
				.setFooter(
					null,
					[
						iconToken('mastodon'),
						'Mastodon • ',
						formatToken('time', time),
						' • ',
						formatToken('date', time)
					]
				)
		}

	}

	async renderBody(data, has_warning = false) {
		let raw_media = data.media_attachments;
		let media;
		if (raw_media?.length > 0) {
			if (raw_media.length > 4)
				raw_media = raw_media.slice(0, 4);

			media = [];
			for(const entity of raw_media) {
				let token;
				if (entity.type === 'image')
					token = imageToken(
						await this.proxyImage(entity.preview_url),
						{
							title: entity.description
						}
					);

				else if (entity.type === 'video') {
					token = {
						type: 'player',
						autoplay: true,
						silent: false,
						content: overlayToken(
							imageToken(
								await this.proxyImage(entity.preview_url),
								{
									alt: entity.description
								}
							),
							{
								center: styleToken({size: '1'}, iconToken('play')),
								'bottom-right': formatToken('duration', Math.round(entity.meta?.original?.duration ?? 0))
							}
						),
						sources: [
							{type: entity.format, src: entity.url}
						]
					};

				} else if (entity.type === 'audio') {
					token = [
						iconToken('volume-up'),
						' ',
						i18nToken('embed.mastodon.audio', 'Audio File ({length,duration})', {
							length: Math.round(entity.meta?.original?.duration ?? 0)
						})
					];

				} else if (entity.type === 'gifv') {
					token = overlayToken(
						{
							type: 'player',
							autoplay: true,
							loop: true,
							silent: true,
							poster: await this.proxyImage(entity.preview_url),
							sources: [
								{type: 'video/mp4', src: entity.url}
							]
						},
						{
							'bottom-left': 'GIF'
						}
					);

				}

				if ( token )
					media.push(linkToken(entity.url, token, {tooltip: false}));
			}

			if ( media.length )
				media = conditionalToken(true, has_warning ? has_warning : data.sensitive ?? undefined, galleryToken(...media));
			else
				media = null;
		}

		const body = boxToken({wrap: 'pre-wrap', 'mg-y': 'small', lines: 10}, refToken('body'));

		let poll = null;
		if ( data.poll && Array.isArray(data.poll.options) ) {
			const options = [];

			for(const opt of data.poll.options) {
				let percentage = Math.round(100 * opt.votes_count / data.poll.votes_count);
				options.push({
					name: i18nToken('embed.mastodon.poll-entry', '{pct,number,percent} {name}', {
						pct: percentage / 100,
						name: opt.title
					}),
					value: boxToken({
						border: true,
						'mg-b': 'small',
						rounding: 2,
						background: 'text',
						width: `${percentage}%`,
						height: '0.5em'
					})
				});
			}

			if ( options.length > 0 )
				poll = boxToken({wrap: 'pre-wrap','mg-y': 'small', border: true, rounding: 2, 'pd': 'small'}, [
					data.poll.expired
						? i18nToken('embed.mastodon.poll-closed', 'This poll has ended.')
						: i18nToken('embed.mastodon.poll-running', 'This poll is active.'),
					{type: 'fieldset', fields: options},
					i18nToken('embed.mastodon.poll-votes', '{count,plural,one {# Vote} other {# Votes}} • {voters,plural,one {# Voter} other {# Voters}}', {
						count: data.poll.votes_count ?? 0,
						voters: data.poll.voters_count ?? 0
					})
				]);
		}

		let card = null;
		if ( data.card && ! media ) {
			const card_image = data.card.image
				? await this.proxyImage(data.card.image)
				: null;

			let iframe_url = data.card.embed_url;

			if ( ! iframe_url && data.card.html ) {
				const parsed = parseHTML(data.card.html),
					child = parsed?.children?.[0];

				if ( child?.type === 'tag' && child.name === 'iframe' && child.attribs.src )
					iframe_url = child.attribs.src;
			}

			if ( iframe_url ) {
				const parsed = new URL(iframe_url);
				//console.log('iframe', iframe_url);
				if ( ! isValidEmbedHost(parsed) )
					iframe_url = null;
			}

			let aspect = 1;
			if ( data.card.width && data.card.height )
				aspect = data.card.width / data.card.height;

			let content;
			if ( data.card.type === 'link' ) {
				content = {
					type: 'header',
					title: data.card.title,
					subtitle: data.card.description,
					image: card_image
						? imageToken(card_image, {aspect})
						: iconToken('docs')
				};

			} else if ( data.card.type === 'video' || data.card.type === 'photo' ) {
				content = this.builder();

				if ( data.card.image ) {
					if ( data.card.type === 'video' && iframe_url )
						content = content
							.addConditional(true, true, galleryToken({
								type: 'player',
								iframe: iframe_url,
								aspect,
								content: overlayToken(
									imageToken(card_image),
									{
										center: styleToken({size: '1'}, iconToken('play'))
									}
								)
							}));

					else if ( data.card.type === 'video' )
						content = content
							.addConditional(true, true, overlayToken(
								imageToken(card_image, {aspect}),
								{
									'center': styleToken({size: '1'}, iconToken('play'))
								}
							));

					else
						content = content
							.addConditional(true, true, galleryToken(
								imageToken(card_image, {aspect})
							));
				}

				content
					.addBox({'mg-y': 'small', lines: 3}, data.card.title)
					.addStyle({weight: 'semibold'}, data.card.provider_name);
			}

			if ( content )
				card = linkToken(data.card.url, content, {
					embed: true,
					interactive: true,
					tooltip: false
				});
		}

		return [
			has_warning ? boxToken({wrap: 'pre-wrap', 'mg-y': 'small'}, [
				refToken('warning'),
				'\n\n'
			]) : null,
			has_warning ? conditionalToken(undefined, true, body) : body,
			poll,
			media,
			card
		];
	}

	async renderUserHeader(user, one_line = false, fragments = null, subtitle = null, extra = null, background = null) {
		let badges = null;

		if ( ! this.service.opts.disable_tags ) {
			badges = [];

			if (user.bot)
				badges.push({
					type: 'tag',
					tag: 'span',
					class: 'ffz-pill',
					content: i18nToken('embed.mastodon.bot', 'Bot')
				});

			badges = badges.length ? badges.map(name => typeof name === 'string' ? ({
				type: 'tag', tag: 'span',
				class: `ffz--mastodon-badge ffz--mastodon-badge__${name}`
			}) : name) : null;
		}

		if (badges)
			badges.unshift(' ');

		const url = new URL(user.url);

		const compact = one_line && subtitle == null && extra == null;

		let builder = this.builder()
			.setLogo(await this.proxyImage(user.avatar));

		if ( compact )
			builder = builder.setCompactHeader();

		let display_name = pickName(user);
		if (user.emojis)
			display_name = replaceEmoji(display_name, user.emojis, fragments);

		if ( one_line )
			return builder
				.setTitle(linkToken(user.url, [
					styleToken({color: 'base'}, display_name),
					badges,
					' ',
					styleToken({weight: 'regular', color: 'alt'}, `@${user.username}`),
					styleToken({weight: 'regular', color: 'alt-2'}, `@${url.host}`)
				], {tooltip: false}))
				.setSubtitle(subtitle)
				.setExtra(extra)
				.setBackground(background);

		return builder
				.setTitle(linkToken(
					user.url, [
						styleToken({color: 'base'}, display_name),
						badges
					],
					{tooltip: false}
				))
				.setSubtitle(linkToken(
					user.url,
					[
						styleToken({color: 'alt'}, `@${user.username}`),
						styleToken({color: 'alt-2'}, `@${url.host}`)
					],
					{tooltip: false}
				))
				.setExtra(extra)
				.setBackground(background);
	}

}

function pickName(user) {
	if (user.display_name && user.display_name.length > 0)
		return user.display_name;
	return user.username;
}

Mastodon.priority = -100;

Mastodon.examples = [
	{title: 'Profile', url: 'https://mastodon.social/@Mastodon'},
	{title: 'Post with Poll', url: 'https://mastodon.social/@SirStendec/109322224416847299'},
	{title: 'Post with GIF', url: 'https://mastodon.social/@SirStendec/109321982274432188'},
	{title: 'Post with Video', url: 'https://mastodon.social/@docpop/111177405335761814'},
	{title: 'Off-Mastodon Profile', url: 'https://niscii.xyz/@ff_xiv_en'},
	{title: 'Off-Mastodon Post', url: 'https://niscii.xyz/notes/98zqr1xpfd'}
];
