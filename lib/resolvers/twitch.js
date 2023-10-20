'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import TwitchAPI from '../twitch-api';
import {i18nToken, iconToken, formatToken, styleToken, overlayToken, imageToken, linkToken, galleryToken, refToken} from '../builder';
import {truncate} from '../utilities';
import dayjs from 'dayjs';


const URL_SPLIT = /\/([^/]+)(?:\/(.+))?$/;
const CLIP_SPLIT = /\/(?:[^/]+)\/clip\/([^/]+)(?:\/(.+))?$/;

const BAD_URLS = [
	'_deck',
	'directory',
	'downloads',
	'drops',
	'friends',
	'inventory',
	'jobs',
	'p',
	'payments',
	'prime',
	'search',
	'settings',
	'store',
	'subscriptions',
	'turbo',
	'wallet'
];


export default class Twitch extends Resolver {

	constructor(service) {
		super(service);

		if ( this.service.opts.twitch_api )
			this.api = new TwitchAPI(service.fetch, service.opts.twitch_api);
	}

	transformURL(url, ctx) {
		if ( ! this.api )
			return UseMetadata;

		if ( url.hostname === 'clips.twitch.tv' ) {
			const clip_id = ctx.clip_id = url.pathname.split('/')[1];
			if ( ! clip_id )
				return UseMetadata;

			ctx.mode = 'clip';
			ctx.fetch = this.api.fetch;
			ctx.cache_key = `twitch-c-${clip_id}`;
			ctx.options = {version: 5};
			return `clips/${clip_id}`;

			// Helix is garbage.
			//return `clips?id=${clip_id}`;
		}

		if ( url.hostname !== 'twitch.tv' && url.hostname !== 'www.twitch.tv' && url.hostname !== 'm.twitch.tv' )
			return UseMetadata;

		// Videos
		if ( url.pathname.startsWith('/videos/') ) {
			const video_id = ctx.video_id = url.pathname.slice(8);
			ctx.mode = 'video';
			ctx.fetch = this.api.fetch;
			ctx.cache_key = `twitch-v-${video_id}`;
			return `videos?id=${video_id}`;
		}

		// Clips: Part 2
		let match = CLIP_SPLIT.exec(url.pathname);
		if ( match ) {
			const clip_id = ctx.clip_id = match[1];
			ctx.mode = 'clip';
			ctx.fetch = this.api.fetch;
			ctx.cache_key = `twitch-c-${clip_id}`;
			ctx.options = {version: 5};
			return `clips/${clip_id}`;

			// Helix is garbage.
			//return `clips?id=${clip_id}`;
		}

		match = URL_SPLIT.exec(url.pathname);
		if ( ! match )
			return UseMetadata;

		let channel_id = match[1],
			extra = match[2];

		if ( channel_id === 'subs' ) {
			match = URL_SPLIT.exec(`/${extra}`);
			if ( match ) {
				channel_id = match[1];
				extra = match[2];
			}
		}

		if ( extra || BAD_URLS.includes(channel_id) )
			return UseMetadata;

		ctx.user = channel_id;
		ctx.mode = 'user';
		ctx.fetch = this.api.fetch;
		ctx.cache_key = `twitch-u-${channel_id}`;
		return `users?login=${channel_id}`;
	}

	processBody(data, mode, ctx) {
		if ( mode !== 'json' )
			return null;

		if ( ctx.mode === 'user' )
			return this.processUser(data, ctx);

		if ( ctx.mode === 'video' )
			return this.processVideo(data, ctx);

		if ( ctx.mode === 'clip' )
			return this.processClip(data, ctx);
	}


	async processClip(clip) {
		if ( ! clip || ! clip.slug )
			return null;

		const user = linkToken(`https://www.twitch.tv/${clip.broadcaster.name}`,
			styleToken({weight: 'semibold', color: 'alt-2'}, clip.broadcaster.display_name));

		const subtitle = clip.game ? i18nToken('clip.desc.1.playing', '{user} playing {game}', {
			user,
			game: styleToken({weight: 'semibold'}, clip.game)
		}) : i18nToken('clip.desc.1', 'Clip of {user}', {user});

		const curator = clip.curator ?
			linkToken(`https://www.twitch.tv/${clip.curator.name}`,
				styleToken({color: 'alt-2'}, clip.curator.display_name)) :
			i18nToken('clip.unknown', 'Unknown');

		const extra = i18nToken('clip.desc.2', 'Clipped by {curator} — {views,number} View{views,en_plural}', {
			curator,
			views: clip.views
		});

		return {
			v: 5,

			short: this.builder()
				.setLogo(clip.thumbnails?.medium, {sfw: true, aspect: 16 / 9})
				.setTitle(clip.title)
				.setSubtitle(subtitle)
				.setExtra(extra),

			full: this.builder()
				.setLogo(clip.broadcaster.logo, {rounding: -1, aspect: 1})
				.setTitle(clip.title)
				.setSubtitle(subtitle)
				.setExtra(extra)
				.setFooter(null, [
					iconToken('twitch'),
					' Twitch'
				])
				.addConditional(true, undefined, galleryToken(
					overlayToken(
						imageToken(clip.thumbnails?.medium, {aspect: 16 / 9}),
						{
							center: styleToken({size: '1'}, iconToken('play')),
							'bottom-right': formatToken('duration', Math.round(clip.duration))
						}
					)
				))
		}
	}


	async processVideo(data) {
		if ( ! data || ! data.data || ! data.data.length )
			return null;

		const video = data.data[0];
		if ( ! video || ! video.id )
			return null;

		let user_data;
		try {
			const result = await this.api.fetch(`users?id=${video.user_id}`).then(resp => resp.ok ? resp.json() : null);
			user_data = result?.data?.[0];

		} catch (err) {
			console.log('could not get user', err);
			user_data = {
				id: video.user_id,
				login: video.user_login,
				display_name: video.user_name
			};
		}

		const fragments = {
			title: video.title,

			thumbnail: imageToken(
				video.thumbnail_url.replace('%{width}', 320).replace('%{height}', 180),
				{
					aspect: 16 / 9
				}
			)
		};

		const user = linkToken(`https://www.twitch.tv/${video.user_login}`,
			styleToken({weight: 'semibold', color: 'alt-2'}, video.user_name));

		fragments.subtitle = video.game ? i18nToken('video.desc.1.playing', 'Video of {user} playing {game}', {
			user,
			game: styleToken({weight: 'semibold'}, video.game)
		}) : i18nToken('video.desc.1', 'Video of {user}', {user});

		let length = dayjs.duration(video.duration).asSeconds();
		if ( Number.isNaN(length) )
			length = dayjs.duration(`PT${video.duration.toUpperCase()}`).asSeconds();

		fragments.extra = i18nToken(
			'video.desc.2', '{length,duration} — {views,number} Views — {date,datetime}', {
				length,
				views: video.view_count,
				date: dayjs(video.published_at)
			}
		)

		return {
			v: 5,

			fragments,

			short: this.builder()
				.setLogo(refToken('thumbnail'))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('subtitle'))
				.setExtra(refToken('extra')),

			full: this.builder()
				.setLogo(user_data?.profile_image_url, {rounding: -1, aspect: 1})
				.setFooter(null, [
					iconToken('twitch'),
					' Twitch • ',
					formatToken('datetime', video.published_at)
				])
				.setTitle(refToken('title'))
				.setSubtitle(refToken('subtitle'))
				.addBox({'mg-y': 'small', lines: 5, wrap: 'pre-wrap'}, video.description)
				.addConditional(true, undefined, galleryToken(
					overlayToken(
						refToken('thumbnail'),
						{
							//center: styleToken({size: '1'}, iconToken('play')),
							'top-left': formatToken('duration', length),
							'bottom-left': i18nToken('video.views', '{views,number} views', {
								views: video.view_count
							})
						}
					)
				))
		}

	}


	async processUser(data) {
		const list = data?.data,
			user = list?.[0];

		if ( ! user || list.length > 1 )
			return null;

		let stream;
		try {
			const result = await this.api.fetch(`streams?user_id=${user.id}`).then(resp => resp.ok ? resp.json() : null);
			stream = result?.data?.[0];

		} catch (err) {
			console.log('could not get stream', err);
			stream = null;
		}

		const fragments = {
			avatar: imageToken(
				user.profile_image_url,
				{
					rounding: -1,
					aspect: 1
				}
			),
			desc: user.description,
			title: [user.display_name]
		};

		if ( stream )
			fragments.game = styleToken({weight: 'semibold'}, stream.game_name);

		if ( user.display_name.trim().toLowerCase() !== user.login )
			fragments.title.push(styleToken({color: 'alt-2'}, [' (', user.login, ')']));

		if ( user.broadcaster_type === 'partner' )
			fragments.title.push(styleToken({color: 'link'}, iconToken('verified')));

		let full = this.builder()
			.setLogo(refToken('avatar'))
			.setTitle(refToken('title'))
			.setFooter(null, [
				iconToken('twitch'),
				' Twitch'
			])
			.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 5}, refToken('desc'));

		if ( stream ) {
			const thumb_url = stream.thumbnail_url ?
				stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : null;

			full = full.add({
				type: 'link',
				url: `https://www.twitch.tv/${user.login}`,
				embed: true,
				interactive: true,
				tooltip: false,
				content: this.builder()
					.addConditional(true).content()
						.addGallery(imageToken(thumb_url ?? user.offline_image_url, {aspect: 16/9}))
					.end()
					.addBox({'mg-y': 'small', lines: 2}, stream.title)
					.addRef('game')
			});
		}

		return {
			v: 5,

			fragments,

			short: this.builder()
				.setLogo(refToken('avatar'))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('desc'))
				.setExtra(stream ? i18nToken(
					'cards.user.streaming', 'streaming {game}', {
						game: refToken('game')
					}
				) : null),

			full
		};
	}

}

Twitch.hosts = ['twitch.tv'];
Twitch.examples = [
	'https://www.twitch.tv/',
	'https://www.twitch.tv/sirstendec',
	'https://www.twitch.tv/videos/42968068',
	'https://www.twitch.tv/sirstendec/clip/HedonisticMagnificentSoymilkChocolateRain',
	'https://clips.twitch.tv/HedonisticMagnificentSoymilkChocolateRain'
]
