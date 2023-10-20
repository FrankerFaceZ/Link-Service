'use strict';

import { formatToken, i18nToken, imageToken, linkToken, overlayToken, refToken, styleToken } from '../builder';
import Resolver from '../resolver';
import { Redirect, UseMetadata } from '../results';

const LOGO = 'https://makercentral.io/logo.png';

const MAKER_REGEX = /^\/users\/([^\/]+)(?:\/|$)/i,
	WORLD_REGEX = /^\/worlds\/([^\/]+)(?:\/|$)/i,
	COURSE_REGEX = /^\/levels\/view\/([^\/]+)(?:\/|$)/i;

async function blobToDataURI(blob) {

	const ab = await blob.arrayBuffer();
	const buf = Buffer.from(ab);

	return `data:${blob.type};base64,${buf.toString('base64')}`;
}

export default class MakerCentral extends Resolver {

	transformURL(url, ctx) {

		let match = MAKER_REGEX.exec(url.pathname);
		if ( match ) {
			return new Redirect(`https://smm2.wizul.us/smm2/maker/${match[1]}`, null, true);

			ctx.mode = 'maker';
			ctx.maker_id = match[1];
			return url;
		}

		match = WORLD_REGEX.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'world';
			ctx.world_id = match[1];
			return url;
		}

		match = COURSE_REGEX.exec(url.pathname);
		if ( match ) {
			return new Redirect(`https://smm2.wizul.us/smm2/course/${match[1]}`, null, true);

			ctx.mode = 'course';
			ctx.course_id = match[1];
			return url;
		}

		return UseMetadata;
	}

	async fetchThumbnail(url) {
		try {
			const resp = await this.fetch(url).then(r => r.ok ? r.blob() : null);
			return resp ?
				await blobToDataURI(resp)
				: null;

		} catch(err) {
			console.error('error downloading thumbnail', err);
			return null;
		}
	}

	processBody(body, mode, ctx) {
		if ( ! body || mode !== 'html' )
			throw new Error('invalid response');

		// See if we can extract the __NEXT_DATA__ from the page.
		let data;

		try {
			data = JSON.parse(body('script#__NEXT_DATA__').text())
		} catch(err) {
			console.error('Error parsing script tag', err);
			return UseMetadata;
		}

		data = data?.props?.pageProps;
		if ( ! data )
			return UseMetadata;

		//console.log(ctx.mode, data);

		if ( ctx.mode === 'maker' )
			return this.processMaker(data, body, ctx);

		if ( ctx.mode === 'world' )
			return this.processWorld(data, body, ctx);

		if ( ctx.mode === 'course' )
			return this.processCourse(data, body, ctx);

		throw new Error('invalid mode');
	}

	async processWorld(data, body, ctx) {

		if ( ! data?.world?.makerId )
			return UseMetadata;

		const thumbs = data.thumbnailUrls ?? {};
		data = data.world;

		// Alright. Reasonably sure we have good data. Go for it.
		// Borrow the level code from the HTML, so we don't need to add our own
		// dash separators.
		let code = body('.level-code').text().trim();
		if ( ! code?.length )
			code = data.makerId;

		let thumbnail;

		// Find the first level.
		const first_id = data.levels?.[0]?.id;
		thumbnail = thumbs[first_id];

		if ( thumbnail )
			thumbnail = await this.fetchThumbnail(thumbnail);

		const logo_proxied = await this.proxyImage(LOGO);

		const fragments = {
			title: [
				i18nToken('world-name', 'Super {maker} World', {
					maker: data.makerName
				}),
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, ['[', code, ']'])
			],
			thumb: imageToken(thumbnail ? thumbnail : logo_proxied),
			user: linkToken(
				`https://makercentral.io/users/${data.makerId}`,
				data.makerName,
				{no_color: true}
			)
		};

		fragments.byline = i18nToken('info-owner', 'By: {author}', {
			author: styleToken({color: 'base'}, refToken('user'))
		});

		const bits = [];
		const fields = [];

		//bits.push(refToken('byline'));
		bits.push(formatToken('date', data.created * 1000));

		bits.push(i18nToken('info-worlds', '{count, plural, one {# World} other {# Worlds}}', {
			count: data.numWorlds ?? 1
		}));

		fields.push({
			name: i18nToken('worlds', 'Worlds'),
			value: data.numWorlds ?? 1,
			inline: true
		});

		bits.push(i18nToken('info-levels', '{count, plural, one {# Level} other {# Levels}}', {
			count: data.numLevels ?? 1
		}));

		fields.push({
			name: i18nToken('levels', 'Levels'),
			value: data.numLevels ?? 1,
			inline: true
		});

		const likes = data.levels.map(x => x.numLikes ?? 0).reduce((a,b) => a+b, 0);
		const plays = data.levels.map(x => x.numPlays ?? 0).reduce((a,b) => a+b, 0);

		bits.push(i18nToken('info-likes', '👍 {likes, number}', {
			likes: likes ?? 0
		}));

		fields.push({
			name: i18nToken('tlikes', 'Total Likes'),
			value: formatToken('number', likes ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('alikes', 'Avg. Likes'),
			value: formatToken('number', Math.round(data.avgLikes ?? 0)),
			inline: true
		});

		fields.push({
			name: i18nToken('tplays', 'Total Plays'),
			value: formatToken('number', plays ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('aplays', 'Avg. Plays'),
			value: formatToken('number', Math.round(data.avgPlays ?? 0)),
			inline: true
		});

		bits.push(i18nToken('info-plays', '{count, plural, one {# Play} other {# Plays}}', {
			count: plays ?? 0
		}));

		fields.push({
			name: i18nToken('acr', 'Avg. Clear Rate'),
			value: formatToken('number', (data.avgClearRate ?? 0) / 100, 'percent'),
			inline: true
		});

		if ( data.avgDifficulty ) {
			let adif,
				adv = 0;

			for(const [k,v] of Object.entries(data.avgDifficulty)) {
				if ( v > adv ) {
					adif = k;
					adv = v;
				}
			}

			if ( adif )
				fields.push({
					name: i18nToken('adif', 'Avg. Difficulty'),
					value: [
						adif,
						' (',
						formatToken('number', adv, 'percent'),
						')'
					],
					inline: true
				});
		}


		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.mcio',
			fragments,

			accent: '#191d25',

			short: this.builder()
				.setLogo(refToken('thumb'))
				.setTitle(refToken('title'))
				.setExtra(bits),

			full: this.builder()
				.setLogo(imageToken(logo_proxied))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('byline'))
				.addGallery(overlayToken(
					refToken('thumb')
				))
				.addFields(...fields)
				.setFooter(
					null, [
						'MakerCentral',
						' • ',
						formatToken('date', data.created * 1000)
					], null, {compact: true}
				)
		}
	}

	async processMaker(data, body, ctx) {

		if ( ! data?.userDocData?.id )
			return UseMetadata;

		data = data.userDocData;

		// Alright. Reasonably sure we have good data. Go for it.
		// Borrow the maker code from the HTML, so we don't need to add our own
		// dash separators.
		let code = body('.level-code').text().trim();
		if ( ! code?.length )
			code = data.id;

		const bits = [];

		const title = [
			data.name,
			' ',
			styleToken({
				weight: 'regular',
				color: 'alt'
			}, ['[', code, ']'])
		];

		bits.push(i18nToken('info-mpoints', '{count, plural, one {# Maker Point} other {# Maker Points}}', {
			count: data.makerPoints ?? 0
		}));

		bits.push(i18nToken('info-ulikes', '{count, plural, one {# Like} other {# Likes}}', {
			count: data.likes ?? 0
		}));

		bits.push(i18nToken('info-levels', '{count, plural, one {# Level} other {# Levels}}', {
			count: data.levels ?? 0
		}));

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.mcio',

			accent: '#191d25',

			short: this.builder()
				.setLogo(imageToken(await this.proxyImage(LOGO)))
				.setTitle(title)
				.setSubtitle(bits)
				.setExtra('MakerCentral')
		}
	}

	async processCourse(data, body, ctx) {

		if ( ! data?.level?.id || ! data.level.name )
			return UseMetadata;

		let thumbnail = data.initThumbnailUrl;
		data = data.level;

		// Alright. Reasonably sure we have good data. Go for it.
		// Borrow the level code from the HTML, so we don't need to add our own
		// dash separators.
		let code = body('.level-code').text().trim();
		if ( ! code?.length )
			code = data.id;

		// If the code does not match, we didn't get a proper page. Fallback.
		if ( code.replace(/-/g, '').toLowerCase() !== ctx.course_id.replace(/-/g, '').toLowerCase())
			return UseMetadata;

		thumbnail = await this.fetchThumbnail(thumbnail);

		const logo_proxied = await this.proxyImage(LOGO);

		const fragments = {
			desc: data.description,
			title: [
				data.name,
				' ',
				styleToken({
					weight: 'regular',
					color: 'alt'
				}, ['[', code, ']'])
			],
			thumb: imageToken(thumbnail ? thumbnail : logo_proxied),
			user: linkToken(
				`https://makercentral.io/users/${data.makerId}`,
				data.makerName,
				{no_color: true}
			)
		};

		fragments.byline = i18nToken('info-owner', 'By: {author}', {
			author: styleToken({color: 'base'}, refToken('user'))
		});

		const bits = [];
		const fields = [];

		if ( data.gameStyle && data.theme ) {
			fields.push({
				name: i18nToken('style', 'Style'),
				value: data.gameStyle,
				inline: true
			});

			fields.push({
				name: i18nToken('theme', 'Theme'),
				value: data.theme,
				inline: true
			});
		}

		bits.push(refToken('byline'));
		bits.push(formatToken('date', data.uploadTime));

		bits.push(i18nToken('info-likes', '👍 {likes, number}', {
			likes: data.numLikes ?? 0
		}));

		fields.push({
			name: i18nToken('likes', 'Likes'),
			value: formatToken('number', data.numLikes ?? 0),
			inline: true
		});

		fields.push({
			name: i18nToken('boos', 'Boos'),
			value: formatToken('number', data.numBoos ?? 0),
			inline: true
		});

		if ( data.numBoos > 0 )
			bits.push(i18nToken('info-boos', '👎 {boos, number}', {
				boos: data.numBoos ?? 0
			}));

		fields.push({
			name: i18nToken('plays', 'Plays'),
			value: formatToken('number', data.numPlays ?? 0),
			inline: true
		});

		bits.push(i18nToken('info-plays', '{count, plural, one {# Play} other {# Plays}}', {
			count: data.numPlays ?? 0
		}));

		fields.push({
			name: i18nToken('clear-rate', 'Clear Rate'),
			value: formatToken('number', data.clearRate ?? 0, 'percent'),
			inline: true
		});

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.mcio',
			fragments,

			accent: '#191d25',

			short: this.builder()
				.setLogo(refToken('thumb'))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('desc'))
				.setExtra(bits),

			full: this.builder()
				.setLogo(imageToken(logo_proxied))
				.setTitle(refToken('title'))
				.setSubtitle(refToken('byline'))
				.addGallery(overlayToken(
					refToken('thumb'),
				))
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 4}, refToken('desc'))
				.addFields(...fields)
				.setFooter(
					null, [
						'MakerCentral',
						' • ',
						formatToken('date', data.uploadTime)
					], null, {compact: true}
				)
		}
	}

}

MakerCentral.hosts = ['makercentral.io'];
MakerCentral.examples = [
	{title: 'Home Page', url: 'https://makercentral.io'},
	{title: 'Maker', url: 'https://makercentral.io/users/1K36CRKDG'},
	{title: 'Course', url: 'https://makercentral.io/levels/view/FN6119VJF'},
	{title: 'World', url: 'https://makercentral.io/worlds/V3YXD950H'}
];
