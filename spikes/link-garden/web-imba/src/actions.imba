# All state transitions and API calls. Imports state; the render tree only reads.

import { signUp, signIn, getSessionUser, createLink, listLinks, setStatus, addTag, todayStats } from './api.imba'
import { state } from './state.imba'
import { parseCapture, isValidUrl } from './util.imba'

export def shownLinks
	state.links.filter do |link|
		link.status == state.tab and (not state.tagFilter or link.tags.includes(state.tagFilter))

export def countFor statusArg
	state.links.filter(do |l| l.status == statusArg).length

export def statsText
	if state.stats
		"today: {state.stats.captured} captured · {state.stats.kept} kept"
	else
		"today: 0 captured · 0 kept"

# The stable-div display swap: structure never changes on login/logout, so the
# fork's broken reconciler never gets exercised (see imba-cheatsheet.md).
export def appDisplay
	if state.user then 'block' else 'none'

export def authDisplay
	if state.user then 'none' else 'block'

# Display toggles — this fork drops event bindings on conditionally rendered
# elements, so every variant renders once and toggles via these (function-call
# interpolation is the proven-working form).
export def captureFormD
	if state.captureOpen then 'block' else 'none'

export def captureHintD
	if state.captureOpen then 'none' else 'block'

export def activeD tabArg
	if state.tab == tabArg then 'block' else 'none'

export def plainD tabArg
	if state.tab == tabArg then 'none' else 'block'

export def filterD
	if state.tagFilter then 'block' else 'none'

export def selD index
	if index == state.selected then 'block' else 'none'

export def unselD index
	if index == state.selected then 'none' else 'block'

export def chipActiveD t
	if state.tagFilter == t then 'block' else 'none'

export def chipPlainD t
	if state.tagFilter == t then 'none' else 'block'

export def taglineD link
	if state.tagTarget == link.id then 'block' else 'none'

export def signupD
	if state.mode == 'signup' then 'block' else 'none'

export def signinD
	if state.mode == 'signup' then 'none' else 'block'

export def sunD
	if state.dark then 'block' else 'none'

export def moonD
	if state.dark then 'none' else 'block'

export def openCapture
	state.captureOpen = yes
	const el = document.querySelector('.capture input')
	if el then el.focus()

export def boot
	state.user = await getSessionUser!
	if state.user then await reload()

export def reload
	try
		state.links = await listLinks!
		state.stats = await todayStats!
	catch err
		state.error = err.message or String(err)

def refreshStats
	todayStats!.then do |s| state.stats = s

export def doAuth
	state.authError = ''
	try
		if state.mode == 'signup'
			await signUp(state.authName, state.authEmail, state.authPassword)
		else
			await signIn(state.authEmail, state.authPassword)
		state.user = await getSessionUser!
		if state.user
			await reload()
		else
			state.authError = 'no session after auth'
	catch err
		state.authError = err.message or String(err)

export def toggleAuthMode
	if state.mode == 'signup'
		state.mode = 'signin'
	else
		state.mode = 'signup'

export def capture
	const parsed = parseCapture(state.captureText)
	if not parsed.url
		state.error = 'enter a url (plus optional #tags)'
		return
	if not isValidUrl(parsed.url)
		state.error = 'enter a full url starting with http:// or https://'
		return
	try
		const link = await createLink(parsed.url, parsed.tags)
		state.links = [link].concat(state.links)
		state.captureText = ''
		state.captureOpen = no
		state.tab = 'NEW'
		refreshStats()
	catch err
		state.error = err.message or String(err)

export def setLinkStatus next
	const link = shownLinks()[state.selected]
	unless link then return
	const withNext = do |l| Object.assign({}, l, {status: next})
	state.links = state.links.map do |l|
		if l.id == link.id then withNext(l) else l
	try
		const updated = await setStatus(link.id, next)
		state.links = state.links.map do |l|
			if l.id == link.id then updated else l
		refreshStats()
	catch err
		state.error = err.message or String(err)
		state.links = state.links.map do |l|
			if l.id == link.id then Object.assign({}, l, {status: link.status}) else l

export def submitTag link
	const name = state.tagInput.trim()
	state.tagTarget = null
	state.tagInput = ''
	if not name or link.tags.includes(name) then return
	state.links = state.links.map do |l|
		if l.id == link.id then Object.assign({}, l, {tags: l.tags.concat([name])}) else l
	try
		const updated = await addTag(link.id, name)
		state.links = state.links.map do |l|
			if l.id == link.id then updated else l
	catch err
		state.error = err.message or String(err)
		state.links = state.links.map do |l|
			if l.id == link.id then Object.assign({}, l, {tags: l.tags.filter(do |tt| tt != name)}) else l

export def selectTab tabArg
	state.tab = tabArg
	state.selected = 0

export def filterTag t
	state.tagFilter = t

export def clearFilter
	state.tagFilter = null

export def selectRow index
	state.selected = index

export def toggleTheme
	state.dark = not state.dark
	document.documentElement.dataset.theme = if state.dark then 'dark' else 'light'
	try
		localStorage.setItem('lg-theme', if state.dark then 'dark' else 'light')
