'use strict';

import {formatToken, i18nToken, refToken} from '../builder';
import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {delimitArray} from '../utilities';

const GS_URL = /^\/gearset\/([0-9a-f-]+)/i,
	API_SERVER = `https://etro.gg/api`;

const STAT_NAMES = {
	'CRFT': 'Craftsmanship',
	'CNTL': 'Control',
	'CP': 'CP',
	'GATH': 'Gathering',
	'PERC': 'Perception',
	'GP': 'GP',
	'MND': 'Mind',
	'INT': 'Intelligence',
	'STR': 'Strength',
	'DEX': 'Dexterity',
	'VIT': 'Vitality',
	'DEF': 'Defense',
	'DH': 'Direct Hit',
	'CRT': 'Critical Hit',
	'DET': 'Determination',
	'SPS': 'Spell Speed',
	'SKS': 'Skill Speed',
	'GCD': 'GCD',
	'HP': 'HP'
};

export default class EtroGG extends Resolver {

	transformURL(url, ctx) {
		const match = GS_URL.exec(url.pathname);
		if ( match ) {
			const gs_id = ctx.gs_id = match[1];
			ctx.cache_key = `etro-gs-${gs_id}`;
			return `${API_SERVER}/gearsets/${gs_id}/`
		}

		return UseMetadata;
	}

	processBody(data) {
		if ( ! data || ! data.id )
			return;

		//console.log(data);

		const bits = [data.jobAbbrev];
		const stats = [];

		if ( Array.isArray(data.totalParams))
			for (const param of data.totalParams) {
				const name = param && param.name;
				if ( ! name )
					continue;

				if ( name === 'Average Item Level')
					bits.push(i18nToken('embed.etro.ilvl', 'ILVL: {level, number}', {level: param.value}));

				if ( STAT_NAMES[name] )
					stats.push({
						name: i18nToken(`embed.etro.${name}`, STAT_NAMES[name]),
						value: [
							formatToken('number', param.value),
							param.units || null
						],
						inline: true
					});
			}

		return {
			v: 5,
			accent: '#B460A6',

			fragments: {
				head: this.builder()
					.setLogo(`https://etro.gg/s/icons${data.jobIconPath}`)
					.setTitle(data.name)
					.setSubtitle(delimitArray(bits))
					.setExtra([
						'Etro • ',
						formatToken('datetime', data.lastUpdate)
					])
			},

			short: this.builder()
				.addRef('head'),

			full: this.builder()
				.addRef('head')
				.addFields(stats)
		}
	}

}

EtroGG.hosts = ['etro.gg'];
EtroGG.examples = [{title: 'Gear Set', url: 'https://etro.gg/gearset/d6944631-b67f-468f-aca8-7d28d3187f6a'}];
