import { CompanionActionContext, CompanionActionDefinitions, CompanionActionEvent } from '@companion-module/base'

import type { ResiStudioInstance } from './main.js'

import { GoLive, StopLive } from './api.js'

export function UpdateActions(self: ResiStudioInstance): void {
	const actions: CompanionActionDefinitions = {}

	actions.goLive = {
		name: 'Go Live',
		description: 'Start a Resilient Live Stream',
		options: [
			{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				default: self.CHOICES_ENCODERS[0].id,
				choices: self.CHOICES_ENCODERS,
			},
			{
				type: 'dropdown',
				label: 'Destination Group',
				id: 'destinationGroup',
				default: self.CHOICES_DESTINATION_GROUPS[0].id,
				choices: self.CHOICES_DESTINATION_GROUPS,
			},
			{
				type: 'textinput',
				label: 'Title',
				id: 'title',
				default: 'Live Stream',
				tooltip: 'Title for the live stream',
				useVariables: true,
			},
			{
				type: 'textinput',
				label: 'Description',
				id: 'description',
				default: '',
				tooltip: 'Description for the live stream',
				useVariables: true,
			},
		],
		callback: async (action: CompanionActionEvent, context: CompanionActionContext) => {
			const encoderId = action.options.encoder?.toString() || self.CHOICES_ENCODERS[0].id
			const destinationGroupId = action.options.destinationGroup?.toString() || self.CHOICES_DESTINATION_GROUPS[0].id
			const title = (await context.parseVariablesInString(action.options.title?.toString() || '')) || 'Live Stream'
			const description = (await context.parseVariablesInString(action.options.description?.toString() || '')) || ''

			GoLive(self, encoderId, destinationGroupId, title, description)
		},
	}

	actions.stopLive = {
		name: 'Stop Live',
		description: 'Stops the Current Live Stream that was started from this module',
		options: [
			{
				type: 'dropdown',
				label: 'Encoder',
				id: 'encoder',
				default: self.CHOICES_ENCODERS[0].id,
				choices: self.CHOICES_ENCODERS,
			},
			{
				type: 'dropdown',
				label: 'Destination Group',
				id: 'destinationGroup',
				default: self.CHOICES_DESTINATION_GROUPS[0].id,
				choices: self.CHOICES_DESTINATION_GROUPS,
			},
		],
		callback: async (action: CompanionActionEvent) => {
			const encoderId = action.options.encoder?.toString() || self.CHOICES_ENCODERS[0].id
			const destinationGroupId = action.options.destinationGroup?.toString() || self.CHOICES_DESTINATION_GROUPS[0].id
			StopLive(self, encoderId, destinationGroupId)
		},
	}

	self.setActionDefinitions(actions)
}
