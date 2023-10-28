'use strict';

import { BskyAgent, RichText } from '@atproto/api';
import { UseMetadata } from '../results';
import Resolver from '../resolver';
import dayjs from 'dayjs';
import { boxToken, conditionalToken, formatToken, galleryToken, i18nToken, iconToken, imageToken, linkToken, overlayToken, refToken, styleToken } from '../builder';

const POST_URL = /^\/profile\/([^\/]+)\/post\/([^\/]+)/i,
	PROFILE_URL = /^\/profile\/([^\/]+)/i;


function findGIFs(store, did, obj) {
	if ( ! obj || ! did )
		return;

	if ( Array.isArray(obj) ) {
		for(const thing of obj)
			findGIFs(store, did, thing);
		return;
	}

	if ( obj?.image?.mimeType === 'image/gif' ) {
		// This is a GIF!
		store[obj.image.ref] = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(obj.image.ref)}`;
	}
}


export default class Bluesky extends Resolver {

	constructor(service) {
		super(service);

		this.opts = this.service.opts.bluesky_api;
		if ( ! this.opts?.identifier || ! this.opts?.password )
			this.opts = null;

		if ( ! this.opts ) {
			this.ready = true;
			return;
		}

		this.agent = new BskyAgent({
			service: this.opts.service ?? 'https://bsky.social'
		});

		this.ready = false;
	}

	awaitReady() {
		if ( this.ready )
			return Promise.resolve(true);

		if ( ! this._ready_wait )
			this._ready_wait = this.getAgentReady()
				.finally(() => this._ready_wait = null);

		return this._ready_wait;
	}

	async getAgentReady() {
		let session;
		if ( this.opts.loadSession ) {
			try {
				session = await this.opts.loadSession();
			} catch(err) {
				console.error('Error getting existing session', err);
				session = null;
			}
		}

		if ( session ) {
			//console.debug('resuming bluesky session');
			await this.agent.resumeSession(session);
		} else {
			//console.debug('creating new bluesky session');
			await this.agent.login({
				identifier: this.opts.identifier,
				password: this.opts.password
			});
		}

		// The agent is ready now, so do whateves.
		this.ready = true;

		// If we have a session, and the session changed, save it.
		if ( this.agent.session && this.opts.saveSession && JSON.stringify(session ?? null) !== JSON.stringify(this.agent.session) )
			await this.opts.saveSession(this.agent.session)
	}

	async transformURL(url, ctx) {
		if ( ! this.agent )
			return UseMetadata;

		let match = POST_URL.exec(url.pathname);
		if ( match ) {
			ctx.skip_request = true;
			ctx.mode = 'post';
			ctx.user_handle = match[1];
			ctx.post_id = match[2];
			ctx.cache_key = `bsky-post-${match[1]}/${match[2]}`;

			return;
		}

		match = PROFILE_URL.exec(url.pathname);
		if ( match ) {
			ctx.skip_request = true;
			ctx.mode = 'user';
			ctx.user_handle = match[1];
			ctx.cache_key = `bsky-user-${match[1]}`;

			return;
		}

		return UseMetadata;
	}

	async getUser(handle) {
		const cache_key = `bsky-u-${handle}`;
		if ( this.service.cache ) {
			const resp = await this.service.cache.get(cache_key);
			if ( resp?.hit )
				return resp.value;
		}

		if ( ! this.ready )
			await this.awaitReady();

		let resp;
		try {
			resp = await this.agent.getProfile({actor: handle});
		} catch(err) {
			resp = null;
		}

		if ( ! resp?.success )
			resp = null;

		const user = resp?.data;

		if ( this.service.cache )
			await this.service.cache.set(cache_key, user);

		return user;
	}

	async getPost(user, post) {
		if ( user?.did )
			user = user.did;

		if ( ! user )
			return null;

		const url = `at://${user}/app.bsky.feed.post/${post}`;

		if ( ! this.ready )
			await this.awaitReady();

		let resp;
		try {
			resp = await this.agent.getPosts({uris: [url]});
		} catch(err) {
			return null;
		}

		if ( ! resp?.success || ! Array.isArray(resp?.data?.posts) )
			return null;

		return resp.data.posts[0] ?? null;
	}

	async processBody(_, __, ctx, ___) {
		//console.log('get body', ctx);

		if ( ctx.mode === 'post' ) {
			const user = await this.getUser(ctx.user_handle),
				post = await this.getPost(user, ctx.post_id);

			return this.processPost(user, post, ctx);
		}

		if ( ctx.mode === 'user' ) {
			const user = await this.getUser(ctx.user_handle);

			return this.processUser(user, ctx);
		}

		return UseMetadata;
	}

	async processUser(user, ctX) {
		if ( ! user?.did )
			return UseMetadata;

		//console.log('data', user);

		const fragments = {
			info: i18nToken(
				'profile-line',
				'{posts,plural,one{# Post}other{# Posts}} • {follows,number} Following • {followers,plural,one{# Follower}other{# Followers}}', {
					posts: user.postsCount ?? 0,
					follows: user.followsCount ?? 0,
					followers: user.followersCount ?? 0
				}
			)
		},
			actions = [];

		// TODO: Detection of content flag / labels, and their application.
		// For now we just assume every banner is NSFW.

		return {
			v: 8,
			accent: '#0085FF',
			i18n_prefix: 'embed.bsky',

			fragments,
			actions,

			short: this.renderUserHeader(
				user, true,
				refToken('body'),
				this.builder()
					.add('Bluesky • ')
					.add(refToken('info'))
			),

			full: this.builder()
				.add(this.renderUserHeader(
					user,
					false,
					null,
					null,
					user.banner
						? imageToken(user.banner, {sfw: false})
						: null
				))
				.add(await this.renderBody(user, 'body', fragments))
				.addField(i18nToken('posts', 'Posts'), formatToken('number', user.postsCount ?? 0), true)
				.addField(i18nToken('follows', 'Follows'), formatToken('number', user.followsCount ?? 0), true)
				.addField(i18nToken('followers', 'Followers'), formatToken('number', user.followersCount ?? 0), true)
				.setFooter(
					null,
					[
						//iconToken('bsky'),
						'Bluesky',
					]
				)
		}

	}

	async processPost(user, post, ctx) {
		if ( ! user?.did || ! post?.record?.text )
			return UseMetadata;

		//console.log('data', user);
		//console.log('post', post);
		//console.log('embed', post.embed?.record?.embeds);

		const time = dayjs(post.record.createdAt)
		const fragments = {};

		// Is this a quote?
		let quoted;
		let embed_record = post.embed?.record;
		if ( ! embed_record?.cid && embed_record?.record )
			embed_record = embed_record.record;
		if ( embed_record?.cid ) {
			let quote_link = `https://bsky.app/profile/${embed_record.author?.handle}`;
			const match = /\/app.bsky.feed.post\/([^\/]+)/.exec(embed_record.uri);
			if ( match )
				quote_link = `${quote_link}/post/${match[1]}`;

			let quote_created;
			if ( embed_record?.value?.createdAt )
				quote_created = dayjs(embed_record.value.createdAt);

			let one_line = true;
			/*if ( quote_created )
				one_line = styleToken({color: 'alt-2'}, [
					' • ',
					formatToken('relative', quote_created)
				]);*/

			quoted = {
				type: 'link',
				embed: true, interactive: true, tooltip: false,
				url: quote_link,
				content: [
					this.renderUserHeader(embed_record.author, one_line),
					await this.renderBody(embed_record),
					quote_created ? {
						type: 'header',
						compact: true,
						title: null,
						subtitle: [
							formatToken('time', quote_created),
							' • ',
							formatToken('date', quote_created)
						]
					} : null
				]
			};
		}

		const actions = [];

		return {
			v: 8,
			accent: '#0085FF',
			i18n_prefix: 'embed.bsky',

			fragments,
			actions,

			short: this.renderUserHeader(
				post.author, true,
				refToken('body'),
				/*this.builder().addI18n(i18n_key, i18n_phrase, {
					post: refToken('body')
				}),*/
				this.builder()
					.add('Bluesky • ')
					.addI18n(
						'info-line',
						'{created,time} • {created,date} • {reposts,plural,one {# Repost} other {# Reposts}} • {likes,plural,one {# Like} other {# Likes}}', {
							created: time,
							reposts: post.repostCount ?? 0,
							likes: post.likeCount ?? 0
						}
					)
			),

			full: this.builder()
				.add(this.renderUserHeader(post.author))
				.add(await this.renderBody(post, 'body', fragments))
				.add(quoted)
				.addField(i18nToken('reposts', 'Reposts'), formatToken('number', post.repostCount ?? 0), true)
				.addField(i18nToken('replies', 'Replies'), formatToken('number', post.replyCount ?? 0), true)
				.addField(i18nToken('likes', 'Likes'), formatToken('number', post.likeCount ?? 0), true)
				.setFooter(
					null,
					[
						//iconToken('bsky'),
						'Bluesky • ',
						formatToken('time', time),
						' • ',
						formatToken('date', time),
					]
				)
		}
	}

	renderUserHeader(user, one_line = false, subtitle = null, extra = null, background = null) {
		let badges = null;

		if ( ! this.service.opts.disable_tags ) {
			badges = [];

			// TODO: Figure out labels?

			badges = badges.length ? badges.map(name => ({
				type: 'tag', tag: 'span',
				class: `ffz--bsky-badge ffz--bsky-badge__${name}`
			})) : null;
		}

		const compact = one_line && subtitle == null && extra == null;

		let builder = this.builder()
			.setLogo(user.avatar, {rounding: compact ? -1 : 3});

			if ( compact )
			builder = builder.setCompactHeader();

		if ( one_line )
			return builder
				.setTitle(linkToken(`https://bsky.app/profile/${user.handle}`, [
					styleToken({color: 'base'}, user.displayName),
					badges,
					' ',
					styleToken({weight: 'regular', color: 'alt-2'}, `@${user.handle}`),
					typeof one_line === 'object' ? one_line : null
				], {tooltip: false}))
				.setSubtitle(subtitle)
				.setExtra(extra)
				.setBackground(background);

		return builder
			.setTitle(linkToken(
				`https://bsky.app/profile/${user.handle}`, [styleToken({color: 'base'}, user.displayName), badges], {tooltip: false}
			))
			.setSubtitle(linkToken(
				`https://bsky.app/profile/${user.handle}`, styleToken({color: 'alt-2'}, `@${user.handle}`), {tooltip: false}
			))
			.setExtra(extra)
			.setBackground(background);
	}

	async renderBody(data, fragment, fragments) {

		const record = data.value ?? data.record,
			facets = record?.facets;
		let text = record?.text ?? data.description;

		// ====================================================================
		// Reply Check
		// ====================================================================
		let replies = null;

		// ====================================================================
		// Handle clickability and stuff.
		// ====================================================================
		if ( Array.isArray(facets) && (! fragment || fragments) ) {
			// Alright, links in Bluesky are done with "facets" which are just
			// Twitter's old stuff, but Bluesky.

			const rt = new RichText({
				text,
				facets
			});

			text = [];

			for(const segment of rt.segments()) {
				if ( segment.isLink() && segment.link?.uri )
					text.push(linkToken(segment.link.uri, segment.text));
				else if ( segment.isMention() && segment.mention?.did )
					text.push(linkToken(`https://bsky.app/profile/${segment.mention.did}`, segment.text));
				else if ( segment.isTag() && segment.tag?.tag )
					text.push(linkToken(`https://bsky.app/search?q=${encodeURIComponent(segment.text)}`, segment.text));
				else
					text.push(segment.text);
			}

			if ( text.length === 1 )
				text = text[0];
		}

		if ( fragment && fragments )
			fragments[fragment] = text;

		// ====================================================================
		// Media Handling
		// ====================================================================
		let media = [],
			handled_embeds = new Set;

		let embeds = data.embeds;
		if ( ! embeds && data.embed )
			embeds = data.embed;
		if ( embeds && ! Array.isArray(embeds) )
			embeds = [embeds];

		// Before looking at that, we should grab all the labels so we can
		// check each image to see if the image should be safety flagged.
		let sensitive;
		if ( Array.isArray(data.labels) && data.labels.length > 0 )
			sensitive = true;

		// Check through the provided raw embeds, and check for GIFs.
		const gifs = {};

		if ( data.author?.did && data.record?.embed ) {
			findGIFs(gifs, data.author.did, data.record.embed.images);
			findGIFs(gifs, data.author.did, data.record.embed.media?.images);

			if ( data.record.embed.record?.author?.did && data.record.embed.record.embed ) {
				findGIFs(gifs, data.record.embed.record.author.did, data.record.embed.record.embed.images);
				findGIFs(gifs, data.record.embed.record.author.did, data.record.embed.record.embed.media?.images);
			}
		}

		if ( Array.isArray(embeds) )
			for(const embed of embeds) {
				let images = embed?.images;
				if ( ! Array.isArray(images) )
					images = embed?.media?.images;

				// Images
				if ( Array.isArray(images) )
					for(const entity of images) {
						let is_gif = false;
						if ( entity.thumb?.endsWith?.('@jpeg') )
							for(const key of Object.keys(gifs)) {
								if ( entity.thumb.includes(key) ) {
									is_gif = key;
									break;
								}
							}

						if ( is_gif ) {
							const url = await this.proxyImage(gifs[is_gif]);

							media.push(linkToken(
								url,
								overlayToken(
									imageToken(
										url,
										{
											alt: entity.alt
										}
									),
									{
										'bottom-left': 'GIF'
									}
								),
								{tooltip: false}
							));

						} else
							media.push(linkToken(
								entity.fullsize,
								imageToken(
									entity.thumb,
									{
										alt: entity.alt
									}
								),
								{tooltip: false}
							));
					}

				// Graysky / Tenor Link Style GIFs
				let uri = embed?.external?.uri;
				if ( uri ) {
					uri = new URL(uri);
					if ( uri.hostname === 'graysky.app' && uri.pathname.startsWith('/gif/') ) {
						const decoded = decodeURIComponent(uri.pathname.slice(5));
						uri = new URL(`https://media.tenor.com/${decoded}`);
					}

					if ( uri.hostname === 'media.tenor.com' && uri.pathname.endsWith('.mp4') ) {
						handled_embeds.add(embed);
						media.push(linkToken(
							embed.external.uri,
							overlayToken(
								{
									type: 'player',
									autoplay: true,
									loop: true,
									silent: true,
									sources: [
										{type: 'video/mp4', src: uri.toString()}
									]
								},
								{
									'bottom-left': 'GIF'
								}
							),
							{tooltip: false}
						));
					}
				}

			}

		media = media.length > 0
			? conditionalToken(true, sensitive ?? undefined, galleryToken(...media))
			: null;

		// ====================================================================
		// Card Handling
		// ====================================================================
		let card = null;

		if ( Array.isArray(embeds) )
			for(const embed of embeds) {
				let uri = embed?.external?.uri;
				if ( ! uri || handled_embeds.has(embed) )
					continue;

				card = linkToken(
					uri,
					this.builder()
						.setLogo(embed.external.thumb)
						.setTitle(embed.external.title)
						.setSubtitle(embed.external.description)
						.setExtra(styleToken({color: 'link'}, uri)),
					{
						embed: true,
						interactive: true,
						tooltip: false
					}
				);

				break;
			}

		return [
			replies ? styleToken({color: 'alt-2', size: '7'}, replies) : null,
			boxToken({wrap: 'pre-wrap', 'mg-y': 'small', lines: 10}, fragment ? refToken(fragment) : text),
			media,
			card
		];
	}

}

Bluesky.hosts = [
	'bsky.app'
];

Bluesky.examples = [
	{title: 'Profile', url: 'https://bsky.app/profile/stendec.dev'},
	{title: 'Post', url: 'https://bsky.app/profile/stendec.dev/post/3kb72wsrw4x2v'},
	{title: 'Post with Quote and Media', url: 'https://bsky.app/profile/mcstronghuge.bsky.social/post/3kbcr4xoktj2b'}
];
