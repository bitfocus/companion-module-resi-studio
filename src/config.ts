import type { SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	clientId: string
	clientSecret: string
	verbose: boolean
	SCHEDULE_IDS: Schedule[]
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This module will communicate with Resi Studio.',
		},
		{
			type: 'static-text',
			id: 'hr1',
			width: 12,
			label: ' ',
			value: '<hr />',
		},
		{
			type: 'static-text',
			id: 'authInfo',
			width: 12,
			label: 'Authentication Information',
			value:
				'To connect to Resi Studio, you need to provide your Client ID and Client Secret. You can find these in your Resi Studio account settings.',
		},
		{
			type: 'textinput',
			id: 'clientId',
			label: 'Client ID',
			default: '',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'clientSecret',
			label: 'Client Secret',
			default: '',
			width: 12,
		},
		{
			type: 'static-text',
			id: 'hr2',
			width: 12,
			label: ' ',
			value: '<hr />',
		},
		{
			type: 'checkbox',
			id: 'verbose',
			label: 'Enable Verbose Logging',
			default: false,
			width: 4,
		},
	]
}
