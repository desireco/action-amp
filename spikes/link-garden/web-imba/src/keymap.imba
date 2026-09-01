# The triage keymap: ⌘K capture · j/k move · K keep · D dismiss · T tag · Esc.

import { state } from './state.imba'
import { shownLinks, setLinkStatus, openCapture } from './actions.imba'

export def onKey event
	if (event.metaKey or event.ctrlKey) and event.key.toLowerCase! == 'k'
		event.preventDefault
		openCapture()
		return
	if event.target instanceof HTMLInputElement then return
	if event.key == 'Escape'
		state.captureOpen = no
		state.tagTarget = null
		state.tagFilter = null
		return
	if event.key == 'j'
		state.selected = Math.min(state.selected + 1, shownLinks().length - 1)
	if event.key == 'k'
		state.selected = Math.max(state.selected - 1, 0)
	if event.key == 'K'
		setLinkStatus('KEPT')
	if event.key == 'D'
		setLinkStatus('DISMISSED')
	if event.key == 'T'
		const link = shownLinks()[state.selected]
		if link
			state.tagTarget = link.id
			state.tagInput = ''
