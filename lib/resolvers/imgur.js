'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, formatToken, iconToken, linkToken, styleToken, boxToken, imageToken, galleryToken, overlayToken, refToken} from '../builder';
import dayjs from 'dayjs';
import {linkify, truncate} from '../utilities';

const ID_EXTRACTOR = /^\/([a-z0-9]+)/i;
const USER_EXTRACTOR = /^\/user\/([^\/]+)/i;
const API_BASE = 'https://api.imgur.com/3';
const BAD_URLS = ['t', 'r', 'new', 'hot', 'jobs', 'blog', 'about', 'apps', 'tos', 'privacy', 'hc', 'memegen', 'vidgif', 'upload', 'search', 'account', 'user'];

const ICON = 'https://s.imgur.com/images/favicon-96x96.png';

export default class Imgur extends Resolver {

	transformURL(url, ctx) {
		if ( ! this.service.opts.imgur_api?.key )
			return UseMetadata;

		if ( url.hostname !== 'imgur.com' && url.hostname !== 'www.imgur.com' && url.hostname !== 'm.imgur.com' && url.hostname !== 'i.imgur.com' )
			return UseMetadata;

		let token = this.service.opts.imgur_api?.key;
		if ( Array.isArray(token) )
			token = token[Math.floor(Math.random() * token.length)];

		ctx.headers = {
			Authorization: `Client-ID ${token}`
		};

		const path = url.pathname;
		if ( path.startsWith('/gallery/') ) {
			ctx.mode = 'gallery';
			const gallery_id = ctx.gallery_id = path.slice(9);
			ctx.cache_key = `imgur-g-${gallery_id}`;
			return `${API_BASE}/gallery/${gallery_id}`;

		} else if ( path.startsWith('/a/') ) {
			ctx.mode = 'album';
			const album_id = ctx.album_id = path.slice(3);
			ctx.cache_key = `imgur-a-${album_id}`;
			return `${API_BASE}/album/${album_id}`;

		} else if ( path.startsWith('/account/favorites/') ) {
			ctx.mode = 'gallery';
			const gallery_id = ctx.gallery_id = path.slice(19);
			ctx.cache_key = `imgur-g-${gallery_id}`;
			return `${API_BASE}/gallery/${gallery_id}`;

		}

		let match = USER_EXTRACTOR.exec(path);
		if ( match ) {
			ctx.mode = 'user';
			const username = ctx.username = match[1].toLowerCase();
			ctx.cache_key = `imgur-u-${username}`;
			return `${API_BASE}/account/${username}`;
		}

		match = ID_EXTRACTOR.exec(path);
		if ( match ) {
			const image_id = ctx.image_id = match[1];
			if ( BAD_URLS.includes(image_id) )
				return UseMetadata;

			ctx.cache_key = `imgur-i-${image_id}`;
			return `${API_BASE}/image/${image_id}`;
		}

		return UseMetadata;
	}

	processBody(data, mode, ctx) {
		if ( ! data || ! data.success || ! data.data || mode !== 'json' )
			return null;

		data = data.data;

		if ( ctx.mode === 'gallery' || ctx.mode === 'album' )
			return this.processGallery(data, ctx);

		if ( ctx.mode === 'user' )
			return this.processUser(data, ctx);

		return this.processImage(data, ctx);
	}


	processUser(data) {
		const timestamp = dayjs(data.created * 1000);

		return {
			v: 8,
			i18n_prefix: 'embed.imgur',
			accent: '#2cd63c',

			fragments: {
				bio: linkify(truncate(data.bio, 280, 15, '...', false)),
				extra: [
					i18nToken('points', '{count, plural, one {# Point} other {# Points}}', {count: data.reputation ?? 0}),
					' • ',
					data.reputation_name
				]
			},

			short: this.builder()
				.setLogo(data.avatar, {aspect: 1})
				.setTitle([
					styleToken({color: 'base'}, data.url),
					' • ',
					'Imgur'
				])
				.setSubtitle(refToken('bio'))
				.setExtra([
					refToken('extra'),
					' • ',
					formatToken('date', timestamp)
				]),

			full: this.builder()
				.setLogo(data.avatar, {aspect: 1})
				.setTitle([
					styleToken({color: 'base'}, data.url)
				])
				.setBackground(data.cover)
				.setSubtitle(refToken('extra'))
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 10}, refToken('bio'))
				.add(this.builder()
					.addHeader(null, [
						'Imgur',
						' • ',
						formatToken('date', timestamp)
					], ICON, {compact: true}))
		}
	}


	processGallery(data) {

		if ( ! data.images )
			data.images = [data];

		const image_count = data.images?.[0]?.animated ? 1 : data.images.length,
			timestamp = dayjs(data.datetime * 1000);

		const gallery = data.in_gallery && data.score != null;

		const user = data.account_url ? i18nToken('by', 'By: {user}', {
			user: linkToken(`https://imgur.com/user/${data.account_url}`, styleToken({
				weight: 'semibold', color: 'alt-2'
			}, data.account_url))
		}) : null;

		const album_type = gallery ?
			i18nToken('gallery', 'Imgur Gallery') :
			i18nToken('album', 'Imgur Album');

		const extra = gallery ? i18nToken(
			'gallery-extra',
			'{posted,datetime} • {points,plural,one{# Point}other{{points,number} Points}} • 👍 {likes,number}  • 👎 {dislikes,number}',
			{
				images: data.images.length,
				posted: timestamp,
				points: data.score,
				likes: data.ups,
				dislikes: data.downs
			}
		) : formatToken('datetime', timestamp);

		const fields = [
			{
				name: i18nToken('views', 'Views'),
				value: formatToken('number', data.views),
				inline: true
			}
		];

		if ( data.images_count > 1 )
			fields.push({
				name: i18nToken('images', 'Images'),
				value: formatToken('number', data.images_count),
				inline: true
			});

		if ( image_count === 1 )
			fields.push({
				name: i18nToken('dimensions', 'Dimensions'),
				value: `${data.images[0].width}×${data.images[0].height}`,
				inline: true
			});

		if ( gallery ) {
			fields.push({
				name: i18nToken('score', 'Score'),
				value: formatToken('number', data.score),
				inline: true
			});
			fields.push({
				name: i18nToken('likes', 'Upvotes'),
				value: formatToken('number', data.ups),
				inline: true
			});
			fields.push({
				name: i18nToken('dislikes', 'Downvotes'),
				value: formatToken('number', data.downs),
				inline: true
			});
		}

		return {
			v: 8,
			i18n_prefix: 'embed.imgur',
			accent: '#2cd63c',

			fragments: {
				head: this.builder()
					.setLogo(data.account_url ? `https://imgur.com/user/${data.account_url}/avatar` : null, {rounding: -1, aspect: 1})
					.setCompactHeader()
					.setTitle(data.title || i18nToken('untitled', 'Untitled'))
					.setSubtitle(user),
				images: this.builder()
					.addConditional(true, data.nsfw, this.renderMedia(data.images)),
				foot: this.builder()
					.addHeader(null, [
						album_type,
						' • ',
						formatToken('datetime', timestamp)
					], ICON, {compact: true})
			},

			short: this.builder()
				.setLogo(image_count > 0 ? `https://i.imgur.com/${data.cover || data.images[0].id}s.jpg` : null, {sfw: ! data.nsfw})
				.setSFWLogo(ICON, {aspect: 1})
				.setTitle(data.title)
				.setSubtitle([
					user,
					user ? ' • ' : null,
					album_type,
					' • ',
					i18nToken(
						'album-stats', '{images,plural,one{# Image}other{# Images}} • {views,plural,one{# View}other{{views,number} Views}}', {
							images: data.images_count || 1,
							views: data.views
						}
					)
				])
				.setExtra(extra),

			mid: this.builder()
				.addRef('head')
				.addRef('images')
				.addRef('foot'),

			full: this.builder()
				.addRef('head')
				.add(image_count === 1 && data.images[0].title ?
					boxToken({'mg-y': 'small'}, data.images[0].title) : null)
				.addRef('images')
				.add(image_count === 1 && data.images[0].description ?
					boxToken(
						{wrap: 'pre-wrap', lines: 5, 'mg-y': 'small'},
						truncate(data.images[0].description, 1000, undefined, undefined, false)
					) : null)
				.addFields(fields)
				.addRef('foot')
		}

	}

	processImage(data) {
		if ( ! data || ! data.id )
			return null;

		const timestamp = dayjs(data.datetime * 1000),
			in_gallery = data.in_gallery && data.ups != null;

		const user = data.account_url ? i18nToken('by', 'By: {user}', {
			user: linkToken(`https://imgur.com/user/${data.account_url}`, styleToken({
				weight: 'semibold', color: 'alt-2'
			}, data.account_url))
		}) : null;

		const extra = in_gallery ? i18nToken(
			'gallery-extra', '{posted,datetime} • {points,plural,one{# Point}other{{points,number} Points}} • 👍 {likes,number}  • 👎 {dislikes,number}', {
				posted: timestamp,
				points: data.score,
				likes: data.ups,
				dislikes: data.downs
			}
		) : formatToken('datetime', timestamp);

		const fields = [
			{name: i18nToken('views', 'Views'), value: formatToken('number', data.views), inline: true},
			{name: i18nToken('dimensions', 'Dimensions'), value: `${data.width}×${data.height}`, inline: true}
		];

		if ( in_gallery ) {
			fields.push({name: i18nToken('score', 'Score'), value: formatToken('number', data.score), inline: true});
			fields.push({name: i18nToken('likes', 'Upvotes'), value: formatToken('number', data.ups), inline: true});
			fields.push({name: i18nToken('dislikes', 'Downvotes'), value: formatToken('number', data.downs), inline: true});
		}

		const aspect = data.width / data.height;

		return {
			v: 8,
			i18n_prefix: 'embed.imgur',
			accent: '#2cd63c',

			fragments: {
				head: this.builder()
					.setLogo(data.account_url ? `https://imgur.com/user/${data.account_url}/avatar` : null, {rounding: -1, aspect: 1})
					.setCompactHeader()
					.setTitle(data.title || i18nToken('untitled', 'Untitled'))
					.setSubtitle(user),

				image: this.builder()
					.addConditional(true, data.nsfw, this.renderMedia([data])),

				foot: this.builder()
					.addHeader(null, [
						i18nToken('image', 'Imgur Image'),
						' • ',
						formatToken('datetime', timestamp)
					], ICON, {compact: true})
			},

			short: this.builder()
				.setLogo(`https://i.imgur.com/${data.id}s.jpg`, {sfw: ! data.nsfw, aspect})
				.setSFWLogo(ICON, {aspect: 1})
				.setTitle(data.title || i18nToken('untitled', 'Untitled'))
				.setSubtitle([
					user,
					user ? ' • ' : null,
					i18nToken('image', 'Imgur Image'),
					' • ',
					`${data.width}×${data.height}`
				])
				.setExtra(extra),

			mid: this.builder()
				.addRef('head')
				.addRef('image')
				.addRef('foot'),

			full: this.builder()
				.addRef('head')
				.addRef('image')
				.add(data.description ? boxToken({
					wrap: 'pre-wrap', lines: 5, 'mg-y': 'small'
				}, linkify(truncate(data.description, 1000, undefined, undefined, false))) : null)
				.addFields(fields)
				.addRef('foot')
		}
	}

	renderMedia(images) {
		if ( ! images || ! images.length )
			return null;

		if ( images[0].animated && images[0].type === 'image/gif' && images[0].mp4 ) {
			images[0].type = 'video/mp4';
			images[0].link = images[0].mp4;
		}

		if ( images[0].animated && images[0].type.startsWith('video/') ) {
			const image = images[0];

			return galleryToken(
				{
					type: 'player',
					loop: true,
					silent: ! image.has_sound,
					autoplay: true,
					poster: `https://i.imgur.com/${image.id}l.jpg`,
					sources: [
						{type: image.type, src: image.link}
					]
				}
			);
		}

		const out = galleryToken(...images.slice(0, 4).map(image => linkToken(
			`https://i.imgur.com/${image.id}.jpg`,
			imageToken(`https://i.imgur.com/${image.id}l.jpg`),
			{tooltip: false}
		)));

		if ( images.length > 4 )
			return overlayToken(
				out,
				{
					'bottom-right': i18nToken('more', 'and {count,number} more', {count: images.length - 4})
				}
			);

		return out;
	}

}


Imgur.hosts = ['imgur.com'];
Imgur.examples = [
	{title: 'Home Page', url: 'https://imgur.com/'},
	{title: 'Gallery GIF', url: 'https://imgur.com/gallery/AIO3nLL'},
	{title: 'Gallery Video', url: 'https://imgur.com/gallery/OBc5FSI'},
	{title: 'Gallery Album', url: 'https://imgur.com/gallery/xGohPGV'},
	{title: 'Single Image', url: 'https://imgur.com/BLDattd'},
	{title: 'Album', url: 'https://imgur.com/a/TbGavxE'},
	{title: 'User', url: 'https://imgur.com/user/Mordy9'}
]
