'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {styleToken, imageToken, flexToken, i18nToken, formatToken, linkToken} from '../builder';

const TEMPLATE = place => `https://www.speedrun.com/images/${place}.png`,
	PLACES = {
		1: TEMPLATE('1st'),
		2: TEMPLATE('2nd'),
		3: TEMPLATE('3rd')
	},
	LOGO = PLACES[1];

const LIMIT = 5;

const BAD_NAMES = [
	'games',
	'series',
	'knowledgebase',
	'streams',
	'forum',
	'news',
	'about'
];


function formatDuration(time, wants_millis = false) {
	const parts = [];

	const seconds = Math.floor(time % 60),
		minutes = Math.floor(time / 60 % 60),
		hours = Math.floor(time / 3600),
		millis = wants_millis ? Math.floor(time % 1 * 1000) : null;

	if ( hours )
		parts.push(`${hours}h`);

	if ( minutes )
		parts.push(`${minutes}m`);

	if ( seconds )
		parts.push(`${seconds}s`);

	if ( millis )
		parts.push(`${millis}ms`);

	return parts.join(' ');
}

export default class SRC extends Resolver {

	transformURL(url, ctx) {
		const match = /^\/user\/([^/]+)(?:\/(individual_levels)?)?$/.exec(url.pathname);
		if ( match ) {
			ctx.mode = 'user-pb';
			ctx.individual = !! match[2];
			ctx.user = match[1].toLowerCase();
			ctx.cache_key = `src-pbs-${match[1]}${ctx.individual ? '-level' : ''}`;
			ctx.options = {redirect: 'follow'};

			return `https://www.speedrun.com/api/v1/users/${match[1]}/personal-bests?embed=players,game,category,level`;
		}

		return UseMetadata;
	}

	processBody(data, mode, ctx) {
		if ( ! data || ! data.data || mode !== 'json' )
			return null;

		data = data.data;

		if ( ctx.mode === 'user-pb' )
			return this.processUserPBs(data, ctx);

		return null;
	}

	processUserPBs(data, ctx) {
		let user, wrs = 0, count = 0;

		const individual = ctx.individual,
			games = new Set,
			categories = new Set,
			levels = new Set;

		for (const run of data) {
			const is_individual = !! run.run?.level;
			if ( is_individual !== individual )
				continue;

			count++;

			const game_id = run.run?.game,
				cat_id = run.run?.category,
				level_id = run.run?.level;

			if ( run.place === 1 )
				wrs++;

			if ( game_id )
				games.add(game_id);
			if ( cat_id )
				categories.add(cat_id);
			if ( level_id )
				levels.add(level_id);

			if ( ! user && Array.isArray(run.players?.data) )
				for (const player of run.players.data) {
					if ( player?.names?.international?.toLowerCase?.() === ctx.user ) {
						user = player;
						break;
					}
				}
		}

		if ( ! user )
			return null;

		const runs = [];
		let i = 0;

		for (const run of data) {
			const is_individual = !! run.run?.level;
			if ( is_individual !== individual )
				continue;

			const game = run.game?.data,
				cat = run.category?.data,
				level = run.level?.data,

				game_name = game?.names?.international,
				cat_name = cat?.name,
				level_name = level?.name,

				millis = game?.ruleset?.['show-milliseconds'],
				igt = game?.ruleset?.['default-time'] === 'ingame',
				time = run.run?.times?.primary_t

			if ( ! game_name || ! time )
				continue;

			const place = i18nToken('embed.src.place', '{place,selectordinal,one {#st} two {#nd} few {#rd} other {#th}}', {place: run.place});
			let place_image = null;
			if ( PLACES[run.place] )
				place_image = imageToken(PLACES[run.place], {class: 'ffz-avatar--size-15', sfw: true});

			runs.push({
				type: 'tag', tag: 'tr',
				content: [
					{type: 'tag', tag: 'td', class: 'tw-pd-t-05', content: place_image},
					{type: 'tag', tag: 'td', class: 'tw-pd-t-05 tw-pd-r-05', content: place},
					{
						type: 'tag', tag: 'td', class: 'tw-pd-t-05 tw-pd-r-05', content: [game_name]
					},
					{
						type: 'tag', tag: 'td', class: 'tw-pd-t-05', content: [
							styleToken({wrap: 'nowrap'}, [
								formatDuration(time, millis),
								' ',
								styleToken({color: 'alt-2'}, igt ?
									i18nToken('embed.src.igt', 'IGT') :
									i18nToken('embed.src.rt', 'RT'))
							])
						]
					}
				]
			});

			runs.push({
				type: 'tag', tag: 'tr',
				content: [
					{type: 'tag', tag: 'td', attrs: {colspan: 2}, content: null},
					{
						type: 'tag', tag: 'td', content: level_name ? [
							cat_name,
							styleToken({color: 'alt-2'}, ' • '),
							level_name
						] : cat_name
					},
					{
						type: 'tag', tag: 'td', content: formatToken('date', run.run.submitted)
					}
				]
			});

			let players = run.run.players;
			if ( Array.isArray(players) && players.length > 1 && Array.isArray(run.players?.data) ) {
				const ids = players.map(x => x.id);
				players = [];

				for (const player of run.players.data) {
					if ( player.id === user.id || ! ids.includes(player.id) || ! player.names?.international )
						continue;

					if ( players.length )
						players.push(', ');

					players.push(linkToken(player.weblink, player.names.international));
				}

				if ( players.length )
					runs.push({
						type: 'tag', tag: 'tr',
						content: [
							{type: 'tag', tag: 'td', attrs: {colspan: 2}, content: null},
							{
								type: 'tag', tag: 'td', content: [
									i18nToken('embed.src.with', 'with {players}', {
										players
									})
								]
							}
						]
					});
			}

			i++;
			if ( i >= LIMIT )
				break;
		}

		if ( count > LIMIT )
			runs.push({
				type: 'tag', tag: 'tr', content: {
					type: 'tag', tag: 'td', attrs: {colspan: 4}, content: [
						flexToken({
							'justify-content': 'center'
						}, styleToken({
							color: 'alt-2'
						}, i18nToken(
							'embed.src.more', '(and {count} more)', {count: count - LIMIT}
						)))
					]
				}
			});


		const name = user.names.international,
			joined = i18nToken(
				'embed.src.joined', 'Joined {when}', {
					when: formatToken('date', user.signup)
				}
			),
			title = individual ? i18nToken(
				'embed.src.pbs-level', '{user}\'s Best Individual Levels', {
					user: user.names.international
				}
			) : i18nToken(
				'embed.src.pbs', '{user}\'s Personal Bests', {
					user: user.names.international
				}
			),
			subtitle = individual ? i18nToken(
				'embed.src.sub-level',
				'{runs,plural,one {# Run} other {# Runs}} • {games,plural,one {# Game} other {# Games}} • {cats,plural,one {# Category} other {# Categories}} • {levels,plural,one {# Level} other {# Levels}}',
				{
					wrs,
					runs: count,
					games: games.size,
					cats: categories.size,
					levels: levels.size
				}
			) : i18nToken(
				'embed.src.subtitle',
				'{wrs,plural,one {# Record} other {# Records}} • {runs,plural,one {# Run} other {# Runs}} • {games,plural,one {# Game} other {# Games}} • {cats,plural,one {# Category} other {# Categories}}',
				{
					wrs,
					runs: count,
					games: games.size,
					cats: categories.size
				}
			);

		return {
			v: 5,
			accent: '#FF7982',

			short: this.builder()
				.setLogo(`https://www.speedrun.com/themes/user/${name}/image.png`, {sfw: true, aspect: 1})
				.setTitle(title)
				.setSubtitle(subtitle)
				.setExtra(flexToken({
					'align-items': 'center'
				}, [
					styleToken({
						'pd-r': 'small'
					}, imageToken(LOGO, {class: 'ffz-avatar--size-15', sfw: true})),
					'Speedrun.com • ',
					joined
				])),

			full: this.builder()
				.setLogo(`https://www.speedrun.com/themes/user/${name}/image.png`, {sfw: true, aspect: 1})
				.setTitle(title)
				.setSubtitle(subtitle)
				.setExtra(joined)
				.add(flexToken({
					'pd-t': 'normal'
				}, {
					type: 'tag',
					tag: 'table',
					class: 'tw-full-width',
					content: [
						{
							type: 'tag', tag: 'thead', class: 'tw-border-b', content: [
								{
									type: 'tag', tag: 'tr', content: [
										{
											type: 'tag', tag: 'th', attrs: {colspan: 2}, content: [styleToken({weight: 'semibold'}, i18nToken('embed.src.t-place', 'Place'))]
										},
										{
											type: 'tag', tag: 'td', content: [styleToken({weight: 'semibold'}, i18nToken('embed.src.t-game', 'Game'))]
										},
										{
											type: 'tag', tag: 'td', content: [styleToken({weight: 'semibold'}, i18nToken('embed.src.t-time', 'Time'))]
										}
									]
								},
								{
									type: 'tag', tag: 'tr', content: [
										{type: 'tag', tag: 'th', attrs: {colspan: 2}, content: null},
										{
											type: 'tag', tag: 'td', content: [
												styleToken({weight: 'semibold'}, i18nToken('embed.src.t-cat', 'Category')),
												individual ? styleToken({color: 'alt-2'}, ' • ') : null,
												individual ? styleToken({weight: 'semibold'}, i18nToken('embed.src.t-level', 'Level')) : null
											]
										},
										{
											type: 'tag', tag: 'td', content: [styleToken({weight: 'semibold'}, i18nToken('embed.src.t-submitted', 'Submitted'))]
										}
									]
								}
							]
						},
						{type: 'tag', tag: 'tbody', content: runs}
					]
				}))
				.addHeader(null, ['Speedrun.com'], LOGO, {compact: true})
		};
	}
}

SRC.hosts = ['speedrun.com'];
