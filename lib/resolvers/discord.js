'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {conditionalToken, i18nToken, iconToken, imageToken, refToken, styleToken} from '../builder';

const LOGO = 'https://discord.com/assets/e05ead6e6ebc08df9291738d0aa6986d.png';

export default class Discord extends Resolver {

	transformURL(url, ctx) {
		let invite_id;
		if ( url.hostname.endsWith('discord.gg') && /\/[^\/]+$/.test(url.pathname) )
			invite_id = url.pathname.slice(1);
		else if ( url.pathname.startsWith('/invite/') )
			invite_id = url.pathname.slice(8);
		else
			return UseMetadata;

		ctx.cache_key = `discord-${invite_id}`;
		return `https://discord.com/api/v6/invites/${invite_id}?with_counts=true`;
	}

	async processBody(data) {
		if ( ! data || ! data.guild || ! data.code )
			return;

		//console.log('data', data);

		const image = data.guild?.icon
			? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`
			: null;

		const subtitle = i18nToken('server', 'Server: {name}', {
			name: styleToken({weight: 'semibold', color: 'alt'}, data.guild.name)
		});

		let extra = [];

		if ( data.channel )
			extra.push(i18nToken('channel', 'Channel: {name}', {
				name: styleToken({weight: 'semibold', color: 'alt'}, `#${data.channel.name}`)
			}));

		if ( data.approximate_member_count )
			extra.push(i18nToken('users', '{count, plural, one {# User} other {# Users}}', {
				count: data.approximate_member_count ?? 0
			}));

		if ( ! extra.length )
			extra = null;
		else
			// Spooky~
			for(let i = 1; i < extra.length; i += 2)
				extra.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.discord',
			accent: '#5865F2', // Blurple

			short: this.builder()
				.setTitle([
					conditionalToken(undefined, true, [
						iconToken('discord'),
						' '
					]),
					i18nToken('invite', 'Discord Invite')
				])
				.setLogo(image, {aspect: 1, sfw: false, rounding: 2})
				.setSFWLogo(iconToken('discord'))
				.setSubtitle(subtitle)
				.setExtra(extra)
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
