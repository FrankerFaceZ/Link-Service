'use strict';

import { formatToken, i18nToken, imageToken, linkToken, overlayToken, refToken, styleToken } from '../builder';
import Resolver from '../resolver';
import { UseMetadata } from '../results';

const API_SERVER = `https://server.opencourse.world/api`;
const LOGO = `https://opencourse.world/images/icon/open-course-world.png`;

const MAKER_REGEX = /^\/makers\/([^\/]+)(?:\/|$)/i,
	COURSE_REGEX = /^\/courses\/([^\/]+)(?:\/|$)/i;

export default class OpenCourseWorld extends Resolver {

	transformURL(url, ctx) {
		/*if ( ! this.service.opts.opencourseworld?.key )
			return UseMetadata;

		ctx.headers = {
			Authorization: `Bearer ${this.service.opts.opencourseworld.key}`
		};*/

		let match = MAKER_REGEX.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'maker';
			ctx.maker_id = match[1];
			return `${API_SERVER}/makers/${match[1]}`;
		}

		match = COURSE_REGEX.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'course';
			ctx.course_id = match[1];
			return `${API_SERVER}/courses/${match[1]}`;
		}

		return UseMetadata;
	}

	processBody(body, mode, ctx) {
		if ( ctx.mode === 'maker' )
			return this.processMaker(body, ctx);

		if ( ctx.mode === 'course' )
			return this.processCourse(body, ctx);

		throw new Error('Invalid mode');
	}

	processMaker(data, ctx) {
		if ( ! data?.id )
			return UseMetadata;

		console.log('data', data);

		const fragments = {
			logo: imageToken(this.proxyImage(LOGO)),
			avatar: imageToken(this.proxyImage(data.image_url), {sfw: false}),
			title: [
				data.username,
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, ['[', data.id, ']'])
			]
		};

		const bits = [];
		const fields = [];

		if ( data.maker_points > 0 || data.maker_likes > 0 ) {
			fields.push({
				name: i18nToken('mpoints', 'Maker Points'),
				value: formatToken('number', data.maker_points ?? 0),
				inline: true
			});

			fields.push({
				name: i18nToken('mlikes', 'Maker Likes'),
				value: formatToken('number', data.maker_likes ?? 0),
				inline: true
			});
		}

		const stats = data.stats ?? {};

		if ( stats.plays > 0 ) {
			fields.push({
				name: i18nToken('plays', 'Plays'),
				value: formatToken('number', stats.plays ?? 0),
				inline: true
			});

			bits.push(i18nToken('info-plays', '{count, plural, one {# Play} other {# Plays}}', {
				count: stats.plays ?? 0
			}));
		}

		if ( stats.tries > 0 ) {
			fields.push({
				name: i18nToken('attempts', 'Attempts'),
				value: formatToken('number', stats.tries),
				inline: true
			});

			bits.push(i18nToken('info-attempts', '{count, plural, one {# Attempt} other {# Attempts}}', {
				count: stats.tries
			}));
		}

		if ( stats.clears > 0 || stats.tries > 0 ) {
			fields.push({
				name: i18nToken('clears', 'Clears'),
				value: formatToken('number', stats.clears ?? 0),
				inline: true
			});

			bits.push(i18nToken('info-clears', '{count, plural, one {# Clear} other {# Clears}}', {
				count: stats.clears ?? 0
			}));
		}

		if ( stats.world_records > 0 ) {
			fields.push({
				name: i18nToken('wrs', 'World Records'),
				value: formatToken('number', stats.world_records),
				inline: true
			});
		}

		if ( stats.first_clears > 0 ) {
			fields.push({
				name: i18nToken('fcs', 'First Clears'),
				value: formatToken('number', stats.first_clears),
				inline: true
			});
		}

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.ocw',
			fragments,

			accent: '#E58F14',

			short: this.builder()
				.setLogo(refToken('avatar'))
				.setSFWLogo(refToken('logo'))
				.setTitle(refToken('title'))
				.setSubtitle(bits)
				.setExtra('Open Course World'),

			full: this.builder()
				.setLogo(imageToken(this.proxyImage(LOGO)))
				.setTitle(data.username)
				.setSubtitle(['[', data.id, ']'])
				.addGallery(overlayToken(
					refToken('avatar'),
				))
				.addFields(...fields)
				.setFooter(
					null, [
						'Open Course World',
					], null, {compact: true}
				)
		};
	}

	processCourse(data, ctx) {
		if ( ! data?.id || ! data.owner?.id )
			return UseMetadata;

		//console.log('data', data);

		const thumbnail = `${API_SERVER}/one_screen_thumbnail/${data.id}`;

		const fragments = {
			desc: data.description,
			title: [
				data.title,
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, ['[', data.id, ']'])
			],
			thumb: imageToken(this.proxyImage(thumbnail)),
			user: linkToken(
				`https://opencourse.world/makers/${data.owner_id}`,
				data.owner?.username ?? data.owner_id,
				{no_color: true}
			)
		};

		fragments.byline = i18nToken('info-owner', 'By: {author}', {
			author: styleToken({color: 'base'}, refToken('user'))
		});

		const bits = [];
		const fields = [];

		bits.push(refToken('byline'));
		bits.push(formatToken('date', data.created));

		bits.push(i18nToken('info-likes', '👍 {likes, number}', {
			likes: data.likes ?? 0
		}));

		if ( data.style && data.theme ) {
			fields.push({
				name: i18nToken('style', 'Style'),
				value: data.style,
				inline: true
			});

			fields.push({
				name: i18nToken('theme', 'Theme'),
				value: data.theme,
				inline: true
			});
		}

		// TODO: Tags

		fields.push({
			name: i18nToken('likes', 'Likes'),
			value: formatToken('number', data.likes ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('boos', 'Boos'),
			value: formatToken('number', data.boos ?? 0),
			inline: true
		});

		if ( data.boos > 0 )
			bits.push(i18nToken('info-boos', '👎 {boos, number}', {
				boos: data.boos ?? 0
			}));

		fields.push({
			name: i18nToken('plays', 'Plays'),
			value: formatToken('number', data.plays ?? 0),
			inline: true
		});

		bits.push(i18nToken('info-plays', '{count, plural, one {# Play} other {# Plays}}', {
			count: data.plays ?? 0
		}));

		fields.push({
			name: i18nToken('clears', 'Clears'),
			value: formatToken('number', data.clears ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('clear-rate', 'Clear Rate'),
			value: formatToken('number', data.clear_rate ?? 0, 'percent'),
			inline: true
		});

		// Find the world record.
		if ( Array.isArray(data.player_results) )
			for(const result of data.player_results) {
				if ( result?.is_world_record ) {
					fields.push({
						name: i18nToken('wr', 'World Record'),
						value: i18nToken('wr-by', '{time, duration} by {holder}', {
							time: Math.round(result.best_time / 1000),
							holder: linkToken(
								`https://opencourse.world/makers/${result.player_id}`,
								result.player?.username ?? result.player_id
							)
						}),
						inline: true
					});
					break;
				}
			}

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.ocw',
			fragments,

			accent: '#E58F14',

			short: this.builder()
				.setLogo(refToken('thumb'))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('desc'))
				.setExtra(bits),

			full: this.builder()
				.setLogo(imageToken(this.proxyImage(LOGO)))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('byline'))
				.addGallery(overlayToken(
					refToken('thumb'),
					{
						'bottom-right': formatToken('duration', Math.round(data.upload_time / 1000))
					}
				))
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 4}, refToken('desc'))
				.addFields(...fields)
				.setFooter(
					null, [
						'Open Course World',
						' • ',
						formatToken('date', data.created)
					], null, {compact: true}
				)
		}
	}

}

OpenCourseWorld.hosts = ['opencourse.world'];
OpenCourseWorld.examples = [
	{title: 'Home Page', url: 'https://opencourse.world/'},
	{title: 'Maker', url: 'https://opencourse.world/makers/PHC-D08-CC8'},
	{title: 'Course', url: 'https://opencourse.world/courses/2CM-Q4W-HD5'}
];
