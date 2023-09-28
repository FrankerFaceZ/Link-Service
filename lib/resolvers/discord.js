'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, imageToken, refToken, styleToken} from '../builder';

const LOGO = 'https://discord.com/assets/e05ead6e6ebc08df9291738d0aa6986d.png';

export default class Discord extends Resolver {

	transformURL(url, ctx) {
		let invite_id;
		/*if ( url.hostname.endsWith('discord.gg') )
			invite_id = url.pathname.slice(1);
		else*/ if ( url.pathname.startsWith('/invite/') )
			invite_id = url.pathname.slice(8);
		else
			return UseMetadata;

		ctx.cache_key = `discord-${invite_id}`;
		return `https://discord.com/api/v6/invites/${invite_id}`;
	}

	processBody(data) {
		if ( ! data || ! data.guild || ! data.code )
			return;

		//console.log('data', data);

		const image = `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`,
			logo = this.proxyImage(LOGO);

		const subtitle = i18nToken('server', 'Server: {name}', {
			name: styleToken({weight: 'semibold'}, data.guild.name)
		});

		const extra = data.channel ? i18nToken('channel', 'Channel: {name}', {
			name: styleToken({weight: 'semibold'}, `#${data.channel.name}`)
		}) : null;

		return {
			v: 6,
			i18n_prefix: 'embed.discord',
			accent: '#5865F2', // Blurple

			fragments: {
				subtitle,
				extra
			},


			short: this.builder()
				.setTitle(i18nToken('invite', 'Discord Invite'))
				.setLogo(image, {aspect: 1, sfw: false, rounding: 2})
				.setSFWLogo(logo, {aspect: 1, rounding: 2})
				.setSubtitle(refToken('subtitle'))
				.setExtra(refToken('extra')),

			full: this.builder()
				.setTitle(i18nToken('invite', 'Discord Invite'))
				.setLogo(logo, {aspect: 1, sfw: true, rounding: 2})
				.setSubtitle(refToken('subtitle'))
				.setExtra(refToken('extra'))
				.addConditional(true, true)
				.content()
				.addGallery(imageToken(image, {sfw: false, rounding: 3}))
		}
	}

}

Discord.hosts = [
	'discordapp.com',
	'discord.com',
	'discord.gg'
];

Discord.examples = [
	{
		title: 'Invitation',
		url: 'https://discord.gg/UrAkGhT'
	}
];
