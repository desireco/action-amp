import './tokens.css'
import './app.css'
import { state } from './state.imba'
import { boot, doAuth, toggleAuthMode, openCapture, capture, setLinkStatus, submitTag, selectTab, filterTag, clearFilter, selectRow, toggleTheme, shownLinks, countFor, statsText, appDisplay, authDisplay, captureFormD, captureHintD, activeD, plainD, filterD, selD, unselD, chipActiveD, chipPlainD, taglineD, signupD, signinD, sunD, moonD } from './actions.imba'
import { hostOf } from './util.imba'
import { onKey } from './keymap.imba'

# Structure-stable render. Two fork rules shape it (imba-cheatsheet.md):
#   1. conditionally rendered elements never get event bindings → every
#      variant renders once, visibility toggled on WRAPPER divs;
#   2. an interpolated style attribute kills the event attribute on the same
#      element → interactive elements carry no style; wrappers carry it.

tag link-garden
	# Event attributes only bind tag-local methods — imported refs do nothing.
	def mount
		window.addEventListener('keydown', onKey)
		boot()

	def submitCapture
		capture()

	def submitOnEnter event
		if event.key == 'Enter'
			event.preventDefault
			capture()

	def tagOnEnter event
		if event.key == 'Enter'
			event.preventDefault
			const link = shownLinks().find(do |l| l.id == state.tagTarget)
			if link then submitTag(link)

	def authSubmit
		doAuth()

	def tabNew
		selectTab('NEW')

	def tabKept
		selectTab('KEPT')

	def tabDismissed
		selectTab('DISMISSED')

	def rowTag t
		filterTag(t)

	def rowTagInput link
		submitTag(link)

	def render
		<self>
			<div.app style="display:{appDisplay()}">
				<header>
					<h1> "Link Garden"
					<span.meta> statsText()
					<span.spacer>
					<button.ghost @click=toggleTheme>
						<span style="display:{sunD()}"> "☀"
						<span style="display:{moonD()}"> "☾"
				<div style="display:{captureFormD()}">
					<div.capture>
						<input placeholder='url  #tag #tag…' bind=state.captureText @keydown=submitOnEnter>
						<button type='button' @click=submitCapture> "add"
				<div style="display:{captureHintD()}">
					<button.capture-hint @click=openCapture>
						<kbd> "⌘K"
						" capture"
				<nav.tabs>
					<div style="display:{activeD('NEW')}">
						<button.active @click=tabNew>
							"new "
							<span.count> countFor('NEW')
					<div style="display:{plainD('NEW')}">
						<button @click=tabNew>
							"new "
							<span.count> countFor('NEW')
					<div style="display:{activeD('KEPT')}">
						<button.active @click=tabKept>
							"kept "
							<span.count> countFor('KEPT')
					<div style="display:{plainD('KEPT')}">
						<button @click=tabKept>
							"kept "
							<span.count> countFor('KEPT')
					<div style="display:{activeD('DISMISSED')}">
						<button.active @click=tabDismissed>
							"dismissed "
							<span.count> countFor('DISMISSED')
					<div style="display:{plainD('DISMISSED')}">
						<button @click=tabDismissed>
							"dismissed "
							<span.count> countFor('DISMISSED')
					<div style="display:{filterD()}">
						<button.filter @click=clearFilter> "#{state.tagFilter} ✕"
				<ul.list>
					for link, index in shownLinks()
						<li.selected style="display:{selD(index)}">
							<div.row>
								<button.row-main @click=selectRow(index)>
									<span.title> link.title
									<span.host> hostOf(link.url)
								<span.chips>
									for t in link.tags
										<span style="display:{chipActiveD(t)}">
											<button.chip.active @click=rowTag(t)> "##{t}"
										<span style="display:{chipPlainD(t)}">
											<button.chip @click=rowTag(t)> "##{t}"
							<div style="display:{taglineD(link)}">
								<div.tagline>
									<input placeholder='tag name' bind=state.tagInput @keydown=tagOnEnter(link)>
						<li style="display:{unselD(index)}">
							<div.row>
								<button.row-main @click=selectRow(index)>
									<span.title> link.title
									<span.host> hostOf(link.url)
								<span.chips>
									for t in link.tags
										<span style="display:{chipActiveD(t)}">
											<button.chip.active @click=rowTag(t)> "##{t}"
										<span style="display:{chipPlainD(t)}">
											<button.chip @click=rowTag(t)> "##{t}"
					else
						<li.empty> "nothing here — capture with ⌘K"
				<footer.keys>
					<span> "j/k move"
					<span> "K keep"
					<span> "D dismiss"
					<span> "T tag"
					<span> "⌘K capture"
				if state.error
					<p.error> state.error
			<div.auth style="display:{authDisplay()}">
				<h1> "Link Garden"
				<p.sub> "capture · triage · keep"
				<form @submit.prevent=authSubmit>
					<div style="display:{signupD()}">
						<input placeholder='name' bind=state.authName>
					<input placeholder='email' type='email' bind=state.authEmail>
					<input placeholder='password' type='password' bind=state.authPassword>
					<button type='submit'>
						<span style="display:{signupD()}"> "Create account"
						<span style="display:{signinD()}"> "Sign in"
				if state.authError
					<p.error> state.authError
				<button.link @click=toggleAuthMode>
					<span style="display:{signupD()}"> "have an account? sign in"
					<span style="display:{signinD()}"> "new here? create an account"

imba.mount <link-garden>
