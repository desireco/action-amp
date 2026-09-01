import './tokens.css'
import './app.css'
import { signUp, signIn, getSessionUser, createLink, listLinks, setStatus, addTag, todayStats } from './api.imba'

def hostOf url
	try
		return new URL(url).host
	catch
		return url

tag link-garden
	def setup
		self.user = null
		self.mode = 'signup'
		self.authName = ''
		self.authEmail = ''
		self.authPassword = ''
		self.authError = ''
		self.links = []
		self.tab = 'NEW'
		self.selected = 0
		self.tagFilter = null
		self.captureOpen = no
		self.captureText = ''
		self.tagInputFor = null
		self.tagInput = ''
		self.error = ''
		self.stats = null
		self.dark = document.documentElement.dataset.theme == 'dark'

	def mount
		window.addEventListener('keydown', self.onKey)
		self.boot()

	def boot
		self.user = await getSessionUser!
		if self.user then await self.reload!

	get shown
		self.links.filter do |link|
			link.status == self.tab and (not self.tagFilter or link.tags.includes(self.tagFilter))

	get statsText
		if self.stats
			"today: {self.stats.captured} captured · {self.stats.kept} kept"
		else
			"today: 0 captured · 0 kept"

	get appDisplay
		if self.user then 'block' else 'none'

	get authDisplay
		if self.user then 'none' else 'block'

	def countFor statusArg
		self.links.filter(do |l| l.status == statusArg).length

	def reload
		try
			self.links = await listLinks!
			self.stats = await todayStats!
		catch err
			self.error = err.message or String(err)

	def refreshStats
		todayStats!.then do |s| self.stats = s

	def doAuth
		self.authError = ''
		try
			if self.mode == 'signup'
				await signUp(self.authName, self.authEmail, self.authPassword)
			else
				await signIn(self.authEmail, self.authPassword)
			self.user = await getSessionUser!
			if self.user
				await self.reload!
			else
				self.authError = 'no session after auth'
		catch err
			self.authError = err.message or String(err)

	def parseCapture
		const parts = self.captureText.trim.split(/\s+/).filter do |p| p.length > 0
		const tags = parts.filter(do |p| p.startsWith('#')).map(do |p| p.slice(1))
		const url = parts.find(do |p| not p.startsWith('#')) or ''
		return { url: url, tags: tags }

	def capture
		const parsed = self.parseCapture()
		if not parsed.url
			self.error = 'enter a url (plus optional #tags)'
			return
		if not /^https?:\/\//.test(parsed.url)
			self.error = 'enter a full url starting with http:// or https://'
			return
		try
			const link = await createLink(parsed.url, parsed.tags)
			self.links.unshift(link)
			self.captureText = ''
			self.captureOpen = no
			self.tab = 'NEW'
			self.refreshStats()
		catch err
			self.error = err.message or String(err)

	def setLinkStatus next
		const link = self.shown[self.selected]
		unless link then return
		const prev = link.status
		link.status = next
		try
			const updated = await setStatus(link.id, next)
			const index = self.links.findIndex(do |l| l.id == link.id)
			if index >= 0 then self.links[index] = updated
			self.refreshStats()
		catch err
			self.error = err.message or String(err)
			link.status = prev

	def submitTag link
		const name = self.tagInput.trim
		self.tagInputFor = null
		if not name or link.tags.includes(name) then return
		link.tags.push(name)
		try
			const updated = await addTag(link.id, name)
			const index = self.links.findIndex(do |l| l.id == link.id)
			if index >= 0 then self.links[index] = updated
		catch err
			self.error = err.message or String(err)
			link.tags.splice(link.tags.indexOf(name), 1)

	def toggleTheme
		self.dark = not self.dark
		document.documentElement.dataset.theme = if self.dark then 'dark' else 'light'
		try
			localStorage.setItem('lg-theme', if self.dark then 'dark' else 'light')

	def selectTab tabArg
		self.tab = tabArg
		self.selected = 0

	def filterTag t
		self.tagFilter = t

	def clearFilter
		self.tagFilter = null

	def selectRow index
		self.selected = index

	def toggleAuthMode
		if self.mode == 'signup'
			self.mode = 'signin'
		else
			self.mode = 'signup'

	def openCapture
		self.captureOpen = yes

	def onKey event
		if (event.metaKey or event.ctrlKey) and event.key.toLowerCase! == 'k'
			event.preventDefault
			self.captureOpen = yes
			return
		if event.target instanceof HTMLInputElement then return
		if event.key == 'Escape'
			self.captureOpen = no
			self.tagInputFor = null
			self.tagFilter = null
			return
		if event.key == 'j'
			self.selected = Math.min(self.selected + 1, self.shown.length - 1)
		if event.key == 'k'
			self.selected = Math.max(self.selected - 1, 0)
		if event.key == 'K'
			self.setLinkStatus('KEPT')
		if event.key == 'D'
			self.setLinkStatus('DISMISSED')
		if event.key == 'T'
			const link = self.shown[self.selected]
			if link
				self.tagInputFor = link.id
				self.tagInput = ''

	def render
		<self>
			<div.app style="display:{self.appDisplay}">
				<header>
					<h1> "Link Garden"
					<span.meta> self.statsText
					<span.spacer>
					<button.ghost @click=toggleTheme>
						if self.dark
							"☀"
						else
							"☾"
				if self.captureOpen
					<form.capture @submit.prevent=capture>
						<input autofocus placeholder='url  #tag #tag…' bind=self.captureText>
						<button> "add"
				else
					<button.capture-hint @click=openCapture>
						<kbd> "⌘K"
						" capture"
				<nav.tabs>
					if self.tab == 'NEW'
						<button.active @click=selectTab('NEW')>
							"new "
							<span.count> self.countFor('NEW')
					else
						<button @click=selectTab('NEW')>
							"new "
							<span.count> self.countFor('NEW')
					if self.tab == 'KEPT'
						<button.active @click=selectTab('KEPT')>
							"kept "
							<span.count> self.countFor('KEPT')
					else
						<button @click=selectTab('KEPT')>
							"kept "
							<span.count> self.countFor('KEPT')
					if self.tab == 'DISMISSED'
						<button.active @click=selectTab('DISMISSED')>
							"dismissed "
							<span.count> self.countFor('DISMISSED')
					else
						<button @click=selectTab('DISMISSED')>
							"dismissed "
							<span.count> self.countFor('DISMISSED')
					if self.tagFilter
						<button.filter @click=clearFilter> "#{self.tagFilter} ✕"
				<ul.list>
					for link, index in self.shown
						if index == self.selected
							<li.selected @click=selectRow(index)>
								<div.row>
									<span.title> link.title
									<span.host> hostOf(link.url)
									<span.chips>
										for t in link.tags
											if self.tagFilter == t
												<button.chip.active @click=filterTag(t)> "##{t}"
											else
												<button.chip @click=filterTag(t)> "##{t}"
								if self.tagInputFor == link.id
									<form.tagline @submit.prevent=submitTag(link)>
										<input autofocus placeholder='tag name' bind=self.tagInput>
						else
							<li @click=selectRow(index)>
								<div.row>
									<span.title> link.title
									<span.host> hostOf(link.url)
									<span.chips>
										for t in link.tags
											if self.tagFilter == t
												<button.chip.active @click=filterTag(t)> "##{t}"
											else
												<button.chip @click=filterTag(t)> "##{t}"
								if self.tagInputFor == link.id
									<form.tagline @submit.prevent=submitTag(link)>
										<input autofocus placeholder='tag name' bind=self.tagInput>
					else
						<li.empty> "nothing here — capture with ⌘K"
				<footer.keys>
					<span> "j/k move"
					<span> "K keep"
					<span> "D dismiss"
					<span> "T tag"
					<span> "⌘K capture"
				if self.error
					<p.error> self.error
			<div.auth style="display:{self.authDisplay}">
				<h1> "Link Garden"
				<p.sub> "capture · triage · keep"
				<form @submit.prevent=doAuth>
					if self.mode == 'signup'
						<input placeholder='name' bind=self.authName>
					<input placeholder='email' type='email' bind=self.authEmail>
					<input placeholder='password' type='password' bind=self.authPassword>
					<button type='submit'>
						if self.mode == 'signup'
							"Create account"
						else
							"Sign in"
				if self.authError
					<p.error> self.authError
				<button.link @click=toggleAuthMode>
					if self.mode == 'signup'
						"have an account? sign in"
					else
						"new here? create an account"

imba.mount <link-garden>
