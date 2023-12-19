'use strict';

import Resolver from '../resolver';
import {Redirect, UseMetadata} from '../results';
import {linkify, truncate} from '../utilities';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import {iconToken, imageToken, formatToken, galleryToken, overlayToken, boxToken, linkToken, styleToken, refToken, i18nToken, flexToken} from '../builder';
import { extractOpenGraph } from '../metadata';

dayjs.extend(duration);
dayjs.extend(relativeTime);

const YT_API = 'https://www.googleapis.com/youtube/v3';


const CHANNEL_PARTS = `snippet,statistics`;


export default class YouTube extends Resolver {

	transformURL(url, ctx) {
		if ( ! this.service.opts.youtube_api?.key )
			return UseMetadata;

		let video_id;

		if ( url.hostname.endsWith('youtu.be') )
			video_id = url.pathname.slice(1);
		else if ( url.pathname.startsWith('/v/') )
			video_id = url.pathname.slice(3);
		else if ( url.searchParams.has('v') )
			video_id = url.searchParams.get('v');
		else if ( url.pathname.startsWith('/shorts/') )
			video_id = url.pathname.substr(8);

		if ( video_id ) {
			ctx.video_id = video_id;
			ctx.cache_key = `youtube-video-${video_id}`;
			return `${YT_API}/videos?part=localizations,snippet,contentDetails,statistics&id=${video_id}&fields=items(id,localizations,snippet(title,publishedAt,defaultLanguage,description,channelId,channelTitle,thumbnails/standard,liveBroadcastContent),contentDetails(duration,dimension,contentRating/ytRating),statistics(viewCount,likeCount))&key=${this.service.opts.youtube_api.key}`;
		}

		if ( url.pathname.startsWith('/channel/') ) {
			const channel = ctx.channel_id = url.pathname.substr(9).split('/')[0];
			ctx.cache_key = `yt-c-${channel}`;
			ctx.mode = 'user';
			return `${YT_API}/channels?part=${CHANNEL_PARTS}&id=${encodeURIComponent(channel)}&key=${this.service.opts.youtube_api.key}`;
		}

		// TODO: Bad URL check.

		ctx.mode = 'url';
		return url;
	}

	async getChannel(id) {
		const cache_key = `yt-chan-${id}`;
		if ( this.service.cache ) {
			const resp = await this.service.cache.get(cache_key);
			if ( resp?.hit )
				return resp.value;
		}

		const req = await this.fetch(`${YT_API}/channels?part=snippet&id=${id}&fields=items(id,snippet(customUrl,thumbnails/default))&key=${this.service.opts.youtube_api.key}`);
		const resp = req.ok ? await req.json() : null;

		const channel = resp?.items?.[0]?.snippet || null;

		if ( this.service.cache )
			await this.service.cache.set(cache_key, channel);

		return channel;
	}

	processCustomURL(body, ctx) {
		const meta = Array.from(body('meta')),
			og_data = extractOpenGraph(meta);

		// See if we have a URL we can understand.
		if ( og_data.url ) {
			const url = new URL(og_data.url, ctx.url);

			if ( url.hostname === 'www.youtube.com' && url.pathname.startsWith('/channel/') )
				return new Redirect(url);
		}

		// If we got here, just give up and fallback to metadata
		// since we have no idea what's going on.

		// We call the metadata resolver directly to avoid a second request.
		return this.service.metadata_resolver.extractMetadata(body, ctx);
	}

	async processUser(data, ctx) {
		const user = data?.items?.[0];
		if ( ! user?.snippet )
			return null;

		const has_handle = user.snippet.customUrl?.startsWith?.('@') ?? false;

		const link = has_handle
			? `https://www.youtube.com/${user.snippet.customUrl}`
			: `https://www.youtube.com/channel/${user.id}`;

		const fragments = {
			bio: truncate(user.snippet.description, 1000, 50, undefined, false),
			sublogo: imageToken(
				await this.proxyImage('https://cdn.frankerfacez.com/static/yt_icon_rgb.png', 'x20'),
				{
					sfw: true,
					alt: 'YouTube',
					youtube_dumb: true,
					height: '20px'
				}
			)
		};


		fragments.logo = user?.snippet?.thumbnails?.default?.url ? imageToken(
			user?.snippet?.thumbnails?.default?.url,
			{
				aspect: 1,
				rounding: -1,
				sfw: true
			}
		) : null;

		fragments.title = linkToken(link, [
			styleToken({color: 'base'}, user.snippet.title),
			has_handle ? ' ' : null,
			has_handle ? styleToken({weight: 'regular', color: 'alt-2'}, user.snippet.customUrl) : null
		]);

		fragments.stats = [
			i18nToken('subs', '{count, plural, one {# Subscriber} other {# Subscribers}}', {count: user.statistics.subscriberCount ?? 0}),
			' • ',
			i18nToken('videos', '{count, plural, one {# Video} other {# Videos}}', {count: user.statistics.videoCount ?? 0})
		];

		return {
			v: 6,
			accent: '#f00',
			i18n_prefix: 'embed.youtube',
			fragments,

			short: this.builder()
				.setLogo(refToken('logo'))
				.setSubLogo(refToken('sublogo'))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('bio'))
				.setExtra(refToken('stats')),

			full: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(refToken('title'))
				.setExtra(refToken('stats'))
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 10}, refToken('bio'))
				.addHeader(
					null, null, null, {compact: true, extra: [
						flexToken({
							inline: true,
							'mg-l': 'small',
							'align-items': 'center'
						}, [
							refToken('sublogo'),
							styleToken({color: 'youtube', 'mg-x': 'small'}, ' YouTube'),
						])
					]}
				)
		}

	}

	processBody(data, mode, ctx) {
		if ( ! data )
			return;

		if ( ctx.mode === 'url' )
			return this.processCustomURL(data, ctx);

		if ( mode !== 'json' )
			return;

		if ( ctx.mode === 'user' )
			return this.processUser(data, ctx);

		return this.processVideo(data, ctx);
	}

	async processVideo(data, ctx) {
		const video = data?.items?.[0];
		if ( ! video?.snippet )
			return null;

		const channel_id = video.snippet.channelId,
			channel = channel_id ? await this.getChannel(channel_id) : null;

		//const desc = truncate(video.snippet.description, 1000, 50, undefined, false),
		const is_live = video.snippet.liveBroadcastContent === 'live',
			duration = is_live ? -1 : dayjs.duration(video.contentDetails.duration).asSeconds(),
			published_date = dayjs(video.snippet.publishedAt),
			is_old = dayjs() - published_date > 86_400_000;

		const rating = video.contentDetails.contentRating,
			age_restricted = rating?.ytRating === 'ytAgeRestricted';

		video.statistics = video.statistics || {};

		const chan_link = linkToken(
			`https://www.youtube.com/${channel?.customUrl ? channel.customUrl : `channels/${channel_id}`}`,
			styleToken({weight: 'semibold'}, video.snippet.channelTitle),
			{
				no_color: true
			}
		)

		const line_one = this.builder().addI18n(
			'embed.youtube.info-1a', '{channel} • 👍 {likes,number} • ', {
				channel: chan_link,
				views: video.statistics.viewCount || 0,
				likes: video.statistics.likeCount || 0
			}
		);

		const title = {},
			desc = {};

		if ( video.localizations )
			for(const [key, val] of Object.entries(video.localizations)) {
				if ( val.title )
					title[key] = truncate(val.title, 512, 50, undefined, false);
				if ( val.description )
					desc[key] = linkify(truncate(val.description, 1000, 50, undefined, false));
			}

		let default_lang = video.snippet.defaultLanguage;
		if ( ! default_lang )
			default_lang = Object.keys(title)[0];
		if ( ! default_lang )
			default_lang = 'en';

		if ( ! title[default_lang] )
			title[default_lang] = truncate(video.snippet.title, 512, 50, undefined, false);
		if ( ! desc[default_lang] )
			desc[default_lang] = linkify(truncate(video.snippet.description, 1000, 50, undefined, false));

		return {
			v: 9,
			accent: '#f00',

			fragments: {
				sublogo: imageToken(
					await this.proxyImage('https://cdn.frankerfacez.com/static/yt_icon_rgb.png', 'x20'),
					{
						sfw: true,
						alt: 'YouTube',
						youtube_dumb: true,
						height: '20px'
					}
				),

				thumb: imageToken(
					video.snippet.thumbnails.standard?.url,
					{
						sfw: ! age_restricted,
						aspect: 16 / 9
					}
				),

				pub: this.service.opts.disable_tags
					? formatToken(is_old ? 'date' : 'relative', published_date)
					: {
						type: 'tag',
						tag: 'time',
						attrs: {
							datetime: published_date
						},
						content: formatToken(is_old ? 'date' : 'relative', published_date)
					},

				one: line_one,
				views: i18nToken('embed.youtube.info-views', '{views,plural,one {# View} other {{views,number} Views}}', {
					views: video.statistics.viewCount || 0
				}),

				title: {
					type: 'i18n_select',
					default: default_lang,
					choices: title
				},

				desc: {
					type: 'i18n_select',
					default: default_lang,
					choices: desc
				},

				short: this.builder()
					.setLogo(refToken('thumb'))
					.setTitle(refToken('title'))
					.setSubLogo(refToken('sublogo'))
					.setSubtitle([
						refToken('one'),
						refToken('pub')
					])
					.setExtra([
						formatToken('duration', duration),
						' • ',
						refToken('views')
					])
			},

			short: refToken('short'),

			mid: this.builder()
				.addRef('short')
				.addBox({wrap: 'pre-wrap', lines: 4}, refToken('desc')),

			full: this.builder()
				.addConditional(true, age_restricted, galleryToken({
					type: 'player',
					iframe: `https://www.youtube.com/embed/${ctx.video_id}?autoplay=1`,
					aspect: 16/9,
					content: overlayToken(
						refToken('thumb'),
						{
							'center': styleToken({size: '2'}, iconToken('play')),
							'bottom-right': formatToken('duration', duration)
						}
					)
				}))
				.addHeader(
					refToken('title'),
					[
						refToken('one'),
						refToken('views')
					],
					channel?.thumbnails?.default?.url ? imageToken(
						channel?.thumbnails?.default?.url,
						{
							aspect: 1,
							rounding: -1,
							sfw: true
						}
					) : null

				)
				.addBox({wrap: 'pre-wrap', lines: 10, 'mg-y': 'small'}, refToken('desc'))
				.addHeader(
					null, null, null, {compact: true, extra: [
						flexToken({
							inline: true,
							'mg-l': 'small',
							'align-items': 'center'
						}, [
							refToken('sublogo'),
							styleToken({color: 'youtube', 'mg-x': 'small'}, ' YouTube'),
							styleToken({}, [
								' • ',
								refToken('pub')
							])
						])
					]}
				)
		}
	}

}

YouTube.hosts = [
	'youtube.com',
	'youtu.be'
];

YouTube.examples = [
	{title: 'Video', url: 'https://www.youtube.com/watch?v=CAL4WMpBNs0'},
	{title: 'User', url: 'https://www.youtube.com/@teamsalvato'}
];
