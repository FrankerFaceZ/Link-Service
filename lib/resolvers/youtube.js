'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {truncate} from '../utilities';

import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import relativeTime from 'dayjs/plugin/relativeTime';
import {iconToken, imageToken, formatToken, galleryToken, overlayToken} from '../builder';

dayjs.extend(duration);
dayjs.extend(relativeTime);


export default class YouTube extends Resolver {

	transformURL(url, ctx) {
		if ( ! this.service.opts.youtube_api?.key )
			return UseMetadata;

		let video_id;

		if ( url.hostname.endsWith('youtu.be') )
			video_id = url.pathname.substr(1);
		else if ( url.pathname.startsWith('/v/') )
			video_id = url.pathname.substr(3);
		else if ( url.searchParams.has('v') )
			video_id = url.searchParams.get('v');

		if ( ! video_id )
			return UseMetadata;

		ctx.cache_key = `youtube-video-${video_id}`;
		return `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${video_id}&fields=items(id,snippet(title,publishedAt,description,channelTitle,thumbnails/standard,liveBroadcastContent),contentDetails(duration,contentRating/ytRating),statistics(viewCount,likeCount,dislikeCount))&key=${this.service.opts.youtube_api.key}`;
	}

	processBody(data, mode) {
		if ( ! data || mode !== 'json' )
			return;

		const video = data?.items?.[0];
		if ( ! video?.snippet )
			return null;

		const desc = truncate(video.snippet.description, 1000, 50, undefined, false),
			is_live = video.snippet.liveBroadcastContent === 'live',
			duration = is_live ? -1 : dayjs.duration(video.contentDetails.duration).asSeconds(),
			published_date = dayjs(video.snippet.publishedAt),
			is_old = dayjs() - published_date > 86400000;

		const rating = video.contentDetails.contentRating,
			age_restricted = rating?.ytRating === 'ytAgeRestricted';

		video.statistics = video.statistics || {};

		const line_one = this.builder().addI18n(
			'embed.youtube.info-1', '{channel} • {views,plural,one {# View} other {{views,number} Views}} • 👍 {likes,number}  • 👎 {dislikes,number}', {
				channel: video.snippet.channelTitle,
				views: video.statistics.viewCount || 0,
				likes: video.statistics.likeCount || 0,
				dislikes: video.statistics.dislikeCount || 0
			}
		);

		const line_two = [
			iconToken('youtube-play'),
			'YouTube • ',
			{type: 'tag', tag: 'time', attrs: {datetime: published_date}, content: formatToken(is_old ? 'date' : 'relative', published_date)}
		];

		return {
			v: 5,
			accent: '#f00',

			short: this.builder()
				.setLogo(video.snippet.thumbnails.standard?.url, {sfw: ! age_restricted, aspect: 16 / 9})
				.setTitle(video.snippet.title)
				.setSubtitle(line_one)
				.setExtra(line_two),

			full: this.builder()
				.addConditional(true, age_restricted, galleryToken(
					overlayToken(
						imageToken(video.snippet.thumbnails.standard?.url, {aspect: 16 / 9, sfw: ! age_restricted}),
						{
							'bottom-right': formatToken('duration', duration)
						}
					)
				))
				.addHeader(
					video.snippet.title,
					line_one
				)
				.addBox({wrap: 'pre-wrap', lines: 5, 'mg-y': 'small'}, desc)
				.addHeader(
					null, null, null, {extra: line_two}
				)
		}
	}

}

YouTube.hosts = [
	'youtube.com',
	'youtu.be'
];
