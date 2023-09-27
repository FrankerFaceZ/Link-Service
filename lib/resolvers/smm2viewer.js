'use strict';

import { formatToken, i18nToken, imageToken, linkToken, overlayToken, refToken, styleToken } from '../builder';
import Resolver from '../resolver';
import { UseMetadata } from '../results';

const API_SERVER = `https://smm2.wizul.us/mm2`;
const LOGO = `https://smm2.wizul.us/images/icon.06ccecfd0179afadfbeaca94f3ca08a5.png`;

const MAKER_REGEX = /^\/smm2\/maker\/([^\/]+)(?:\/|$)/i,
	COURSE_REGEX = /^\/smm2\/course\/([^\/]+)(?:\/|$)/i;


function sanitizeId(input) {
	return input.replace(/-/g, '').toUpperCase();
}


function dashyId(input) {
	input = sanitizeId(input);

	const bits = [];

	for(let i = 0; i < input.length; i += 3) {
		bits.push(input.slice(i, i + 3));
	}

	return bits.join('-');
}


export default class SMM2Viewer extends Resolver {

	transformURL(url, ctx) {
		let match = MAKER_REGEX.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'maker';
			ctx.maker_id = match[1];
			return `${API_SERVER}/user_info/${sanitizeId(match[1])}`;
		}

		match = COURSE_REGEX.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'course';
			ctx.course_id = match[1];
			return `${API_SERVER}/level_info/${sanitizeId(match[1])}`;
		}

		return UseMetadata;
	}

	processBody(body, mode, ctx) {
		if ( mode !== 'json' )
			throw new Error('Invalid mode');

		//console.log('data', body);

		if ( ctx.mode === 'maker' )
			return this.processMaker(body, ctx);

		if ( ctx.mode === 'course' )
			return this.processCourse(body, ctx);

		throw new Error('Invalid mode');
	}

	processMaker(data, ctx) {

		if ( ! data?.pid )
			return UseMetadata;

		const code = dashyId(data.code);

		const fragments = {
			logo: imageToken(this.proxyImage(LOGO)),
			avatar: data.mii_image
				? imageToken(this.proxyImage(data.mii_image))
				: refToken('logo'),
			title: [
				data.name,
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, [
					'[',
					code,
					']'
				])
			]
		};

		const bits = [];
		const extra = [];
		const fields = [];

		fields.push({
			name: i18nToken('mpoints', 'Maker Points'),
			value: formatToken('number', data.maker_points ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('mlikes', 'Maker Likes'),
			value: formatToken('number', data.likes ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('levels', 'Uploaded Levels'),
			value: formatToken('number', data.uploaded_levels ?? 0),
			inline: true
		});

		bits.push(i18nToken('info-levels', '{count, plural, one {# Level} other {# Levels}}', {
			count: data.uploaded_levels ?? 0
		}));

		if ( data.courses_played > 0 ) {
			fields.push({
				name: i18nToken('played', 'Played'),
				value: formatToken('number', data.courses_played),
				inline: true
			});

			bits.push(i18nToken('info-played', '{count,number} Played', {
				count: data.courses_played
			}));
		}

		if ( data.courses_attempted > 0 ) {
			fields.push({
				name: i18nToken('attempts', 'Attempts'),
				value: formatToken('number', data.courses_attempted),
				inline: true
			});

			bits.push(i18nToken('info-attempts', '{count, plural, one {# Attempt} other {# Attempts}}', {
				count: data.courses_attempted
			}));
		}

		if ( data.courses_cleared > 0 || data.courses_attempted > 0 ) {
			fields.push({
				name: i18nToken('clears', 'Clears'),
				value: formatToken('number', data.courses_cleared ?? 0),
				inline: true
			});

			bits.push(i18nToken('info-clears', '{count, plural, one {# Clear} other {# Clears}}', {
				count: data.courses_cleared ?? 0
			}));
		}

		if ( data.world_records > 0 ) {
			fields.push({
				name: i18nToken('wrs', 'World Records'),
				value: formatToken('number', data.world_records),
				inline: true
			});
		}

		if ( data.first_clears > 0 ) {
			fields.push({
				name: i18nToken('fcs', 'First Clears'),
				value: formatToken('number', data.first_clears),
				inline: true
			});
		}

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.mm2',
			fragments,

			accent: '#D21919',

			short: this.builder()
				.setLogo(refToken('avatar'))
				.setSFWLogo(refToken('logo'))
				.setTitle(refToken('title'))
				.setSubtitle(bits)
				.setExtra('SMM2 Viewer'),

			full: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(data.name)
				.setSubtitle(['[', code, ']'])
				.addGallery(overlayToken(
					refToken('avatar')
				))
				.addFields(...fields)
				.setFooter(
					null, [
						'SMM2 Viewer'
					], null, {compact: true}
				)
		};
	}

	processCourse(data, ctx) {
		if ( ! data?.course_id || ! data?.uploader?.code )
			return UseMetadata;

		const thumbnail = `${API_SERVER}/level_thumbnail/${data.course_id}`;
		const code = dashyId(data.course_id);

		const fragments = {
			desc: data.description,
			title: [
				data.name,
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, ['[',  code, ']'])
			],
			thumb: imageToken(this.proxyImage(thumbnail)),
			user: data.uploader ? linkToken(
				`https://smm2.wizul.us/smm2/maker/${dashyId(data.uploader.code)}`,
				data.uploader.name,
				{no_color: true}
			) : null
		};

		fragments.byline = i18nToken('info-owner', 'By: {author}', {
			author: styleToken({color: 'base'}, refToken('user'))
		});

		const bits = [];
		const fields = [];

		bits.push(refToken('byline'));
		bits.push(formatToken('date', data.uploaded * 1000));

		bits.push(i18nToken('info-likes', '👍 {likes, number}', {
			likes: data.likes ?? 0
		}));

		if ( data.game_style_name && data.theme_name ) {
			fields.push({
				name: i18nToken('style', 'Style'),
				value: data.game_style_name,
				inline: true
			});

			fields.push({
				name: i18nToken('theme', 'Theme'),
				value: data.theme_name,
				inline: true
			});
		}

		if ( Array.isArray(data.tags_name) && data.tags_name.length > 0 ) {
			const tags = data.tags_name;
			for(let i = 1; i < tags.length; i += 2)
				tags.splice(i, 0, ', ');

			fields.push({
				name: i18nToken('tags', 'Tags'),
				value: tags,
				inline: true
			});
		}

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

		let clear_rate = 0;
		if ( data.attempts > 0 )
			clear_rate = (data.clears ?? 0) / data.attempts;

		fields.push({
			name: i18nToken('clear-rate', 'Clear Rate'),
			value: formatToken('number', clear_rate, 'percent'),
			inline: true
		});

		// Find the world record.
		if ( data.record_holder?.name && data.world_record )
			fields.push({
				name: i18nToken('wr', 'World Record'),
				value: i18nToken('wr-by', '{time, duration} by {holder}', {
					time: Math.round(data.world_record / 1000),
					holder: linkToken(
						`https://smm2.wizul.us/smm2/maker/${dashyId(data.record_holder.code)}`,
						data.record_holder.name
					)
				}),
				inline: true
			});

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
						'SMM2 Viewer',
						' • ',
						formatToken('date', data.uploaded * 1000)
					], null, {compact: true}
				)
		}
	}

}

SMM2Viewer.hosts = ['smm2.wizul.us'];
SMM2Viewer.examples = [
	{title: 'Maker', url: 'https://smm2.wizul.us/smm2/maker/D2G-W84-50H/uploaded-courses'},
	{title: 'Course', url: 'https://smm2.wizul.us/smm2/course/SYG-7FR-QLG'}
];
