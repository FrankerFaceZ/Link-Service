'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import TwitchAPI from '../twitch-api';
import {i18nToken, iconToken, formatToken, styleToken, overlayToken, imageToken, linkToken, galleryToken} from '../builder';
import {truncate} from '../utilities';
import dayjs from 'dayjs';


const URL_SPLIT = /\/([^\/]+)(?:\/(.+))?$/;
const CLIP_SPLIT = /\/(?:[^\/]+)\/clip\/([^\/]+)(?:\/(.+))?$/;

const BAD_URLS = [
	'p',
	'directory',
	'downloads',
	'jobs',
	'turbo',
	'friends',
	'subscriptions',
	'inventory',
	'payments',
	'settings'
];


export default class Twitch extends Resolver {

	constructor(service) {
		super(service);

		if ( this.service.opts.twitch_api )
			this.api = new TwitchAPI(service.opts.twitch_api);
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

			ctx.options = {version: 5};
			return `clips/${clip_id}`;

			// Helix is garbage.
			//return `clips?id=${clip_id}`;
		}

		if ( url.hostname !== 'twitch.tv' && url.hostname !== 'www.twitch.tv' )
			return UseMetadata;

		// Videos
		if ( url.pathname.startsWith('/videos/') ) {
			const video_id = ctx.video_id = url.pathname.substr(8);
			ctx.mode = 'video';
			ctx.fetch = this.api.fetch;

			ctx.options = {version: 5};
			return `videos/${video_id}`;

			// Helix is garbage.
			// return `videos?id=${video_id}`;
		}

		// Clips: Part 2
		let match = CLIP_SPLIT.exec(url.pathname);
		if ( match ) {
			const clip_id = ctx.clip_id = match[1];
			ctx.mode = 'clip';
			ctx.fetch = this.api.fetch;

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
				.setLogo(clip.thumbnails?.medium, {sfw: false, aspect: 16 / 9})
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
				.addConditional(true, true, galleryToken(
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


	async processVideo(video) {
		if ( ! video || ! video._id )
			return null;

		const user = linkToken(`https://www.twitch.tv/${video.channel.name}`,
			styleToken({weight: 'semibold', color: 'alt-2'}, video.channel.display_name));

		const subtitle = video.game ? i18nToken('clip.desc.1.playing', '{user} playing {game}', {
			user,
			game: styleToken({weight: 'semibold'}, video.game)
		}) : i18nToken('video.desc.1', 'Video of {user}', {user});

		const extra = i18nToken(
			'video.desc.2', '{length,duration} — {views,number} Views - {date,datetime}', {
				length: video.length,
				views: video.views,
				date: dayjs(video.published_at)
			}
		)

		return {
			v: 5,

			short: this.builder()
				.setLogo(video.preview?.large, {sfw: false, aspect: 16 / 9})
				.setTitle(video.title)
				.setSubtitle(subtitle)
				.setExtra(extra),

			full: this.builder()
				.setLogo(video.channel.logo, {rounding: -1, aspect: 1})
				.setFooter(null, [
					iconToken('twitch'),
					' Twitch'
				])
				.setTitle(video.title)
				.setSubtitle(subtitle)
				.setExtra(extra)
				.addBox({'mg-y': 'small', lines: 5, wrap: 'pre-wrap'}, truncate(video.description, 1000, undefined, undefined, false))
				.addConditional(true, true, galleryToken(
					overlayToken(
						imageToken(video.preview?.large, {aspect: 16 / 9}),
						{
							center: styleToken({size: '1'}, iconToken('play')),
							'bottom-right': formatToken('duration', Math.round(video.length))
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
			stream = (await this.api.fetch(`streams/${user.id}`, {version: 5})
				.then(resp => resp.ok ? resp.json() : null))?.stream;
		} catch (err) {
			stream = null;
		}

		let subtitle;
		if ( stream )
			subtitle = i18nToken(
				'cards.user.streaming', 'streaming {game}', {
					game: styleToken({weight: 'semibold'}, stream.game)
				}
			);

		const extra = truncate(user.description);
		const title = [user.display_name];

		if ( user.display_name.trim().toLowerCase() !== user.login )
			title.push(styleToken({color: 'alt-2'}, [' (', user.login, ')']));

		if ( user.broadcaster_type === 'partner' )
			title.push(styleToken({color: 'link'}, iconToken('verified')));

		let full = this.builder()
			.setLogo(user.profile_image_url, {rounding: -1, aspect: 1})
			.setTitle(title)
			.setSubtitle(subtitle)
			.setExtra(stream ? extra : null)
			.setFooter(null, [
				iconToken('twitch'),
				' Twitch'
			]);

		if ( stream )
			full = full
				.addBox({'mg-y': 'small', lines: 1}, stream.channel?.status)
				.addConditional(true).content()
				.addGallery(imageToken(stream.preview?.large ?? user.offline_image_url, {aspect: 16 / 9}))
				.end();
		else
			full = full
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 5}, truncate(user.description, 1000, undefined, undefined, false));

		full = full.addField(i18nToken('embed.twitch.views', 'Views'), formatToken('number', user.view_count || 0), true);
		if ( stream?.channel?.followers )
			full = full.addField(i18nToken('embed.twitch.followers', 'Followers'), formatToken('number', stream.channel.followers || 0), true);

		return {
			v: 5,

			short: this.builder()
				.setLogo(user.profile_image_url, {rounding: -1, aspect: 1})
				.setTitle(title)
				.setSubtitle(subtitle)
				.setExtra(truncate(user.description)),

			full
		}
	}

}

Twitch.hosts = ['twitch.tv'];
