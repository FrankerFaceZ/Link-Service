'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {i18nToken, imageToken, styleToken} from '../builder';

const LOGO = 'https://discord.com/assets/e05ead6e6ebc08df9291738d0aa6986d.png';


export default class Discord extends Resolver {

	transformURL(url, ctx) {
		let invite_id;
		if ( url.hostname.endsWith('discord.gg') )
			invite_id = url.pathname.substr(1);
		else if ( url.pathname.startsWith('/invite/') )
			invite_id = url.pathname.substr(8);
		else
			return UseMetadata;

		ctx.cache_key = `discord-${invite_id}`;
		return `https://discord.com/api/v6/invites/${invite_id}`;
	}

	processBody(data) {
		if ( ! data || ! data.guild || ! data.code )
			return;

		const image = `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`;

		const subtitle = i18nToken('embed.discord.server', 'Server: {name}', {
			name: styleToken({weight: 'semibold'}, data.guild.name)
		});

		const extra = data.channel ? i18nToken('embed.discord.channel', 'Channel: {name}', {
			name: styleToken({weight: 'semibold'}, `#${data.channel.name}`)
		}) : null;

		return {
			v: 5,

			accent: '#7289DA', // Blurple

			short: this.builder()
				.setTitle(i18nToken('embed.discord.invite', 'Discord Invite'))
				.setLogo(image, {aspect: 1, sfw: false, rounding: 2})
				.setSubtitle(subtitle)
				.setExtra(extra),

			full: this.builder()
				.setTitle(i18nToken('embed.discord.invite', 'Discord Invite'))
				.setLogo(LOGO, {aspect: 1, rounding: 2})
				.setSubtitle(subtitle)
				.setExtra(extra)
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
