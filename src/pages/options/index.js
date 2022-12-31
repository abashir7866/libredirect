import utils from "../../assets/javascripts/utils.js"
import localise from "../../assets/javascripts/localise.js"

let config,
	options,
	divs = {}

for (const a of document.getElementById("links").getElementsByTagName("a")) {
	a.addEventListener("click", e => {
		const path = a.getAttribute("href").replace("#", "")
		loadPage(path)
		e.preventDefault()
	})
}

await new Promise(resolve => {
	fetch("/config.json").then(response => response.text())
		.then(data => {
			config = JSON.parse(data)
			resolve()
		})
})
await new Promise(resolve => {
	browser.storage.local.get("options", r => {
		options = r.options
		resolve()
	})
})

function changeFrontendsSettings(service) {
	for (const frontend in config.services[service].frontends) {
		if (config.services[service].frontends[frontend].instanceList) {
			const frontendDiv = document.getElementById(frontend)
			if (typeof divs[service].frontend !== "undefined") {
				if (frontend == divs[service].frontend.value) {
					frontendDiv.style.display = "block"
				} else {
					frontendDiv.style.display = "none"
				}
			}
		}
	}
}

function loadPage(path) {
	for (const section of document.getElementById("pages").getElementsByTagName("section")) section.style.display = "none"
	document.getElementById(`${path}_page`).style.display = "block"

	for (const a of document.getElementById("links").getElementsByTagName("a"))
		if (a.getAttribute("href") == `#${path}`) a.classList.add("selected")
		else a.classList.remove("selected")

	let stateObj = { id: "100" }
	window.history.pushState(stateObj, "Page 2", `/pages/options/index.html#${path}`)

	const service = path;
	divs[service] = {}
	for (const option in config.services[service].options) {
		divs[service][option] = document.getElementById(`${service}-${option}`)

		if (typeof config.services[service].options[option] == "boolean") divs[service][option].checked = options[service][option]
		else divs[service][option].value = options[service][option]

		divs[service][option].addEventListener("change", () => {
			browser.storage.local.get("options", r => {
				let options = r.options
				if (typeof config.services[service].options[option] == "boolean") options[service][option] = divs[service][option].checked
				else options[service][option] = divs[service][option].value
				browser.storage.local.set({ options })
				changeFrontendsSettings(service)
			})
		})
	}

	if (Object.keys(config.services[service].frontends).length > 1) {
		changeFrontendsSettings(service)
	}

	for (const frontend in config.services[service].frontends) {
		if (config.services[service].frontends[frontend].instanceList) {
			for (const network in config.networks) {
				processDefaultCustomInstances(frontend, network, document)
			}
		}
	}
}

const r = window.location.href.match(/#(.*)/)
if (r) loadPage(r[1])
else loadPage("general")

async function processDefaultCustomInstances(frontend, network, document) {
	let networkElement = document.getElementById(frontend).getElementsByClassName(network)[0]
	let customInstances = []
	let checkListElement = networkElement.getElementsByClassName("checklist")[0]

	let cloudflareBlackList = []
	let authenticateBlackList = []
	await new Promise(resolve => {
		fetch("/instances/blacklist.json")
			.then(response => response.text())
			.then(data => {
				cloudflareBlackList = JSON.parse(data).cloudflare
				authenticateBlackList = JSON.parse(data).authenticate
				resolve()
			})
	})

	let frontendDefaultRedirects

	let redirects, options

	await new Promise(async resolve =>
		browser.storage.local.get(["options", "redirects",], r => {
			frontendDefaultRedirects = r.options[frontend][network].enabled
			customInstances = r.options[frontend][network].custom
			options = r.options
			redirects = r.redirects
			resolve()
		})
	)

	function calcCheckBoxes() {
		for (const element of checkListElement.getElementsByTagName("input")) {
			element.checked = frontendDefaultRedirects.includes(element.className)
		}
	}
	if (redirects[frontend][network].length > 0)
		checkListElement.innerHTML = [
			`
			<div class="some-block option-block">
				<h4>${utils.camelCase(network)}</h4>
			</div>
			`,
			...redirects[frontend][network]
				.sort((a, b) =>
					(cloudflareBlackList.includes(a) && !cloudflareBlackList.includes(b))
					||
					(authenticateBlackList.includes(a) && !authenticateBlackList.includes(b))
				)
				.map(x => {
					const cloudflare = cloudflareBlackList.includes(x) ? ' <span style="color:red;">cloudflare</span>' : ""
					const authenticate = authenticateBlackList.includes(x) ? ' <span style="color:orange;">authenticate</span>' : ""

					let warnings = [cloudflare, authenticate].join(" ")
					return `
					<div>
						<x>
							<a href="${x}" target="_blank">${x}</a>${warnings}
						</x>
						<input type="checkbox" class="${x}"/>
                  	</div>`
				}),
			'<br>'
		].join("\n<hr>\n")

	localise.localisePage()

	calcCheckBoxes()

	for (let element of checkListElement.getElementsByTagName("input")) {
		networkElement.getElementsByClassName(element.className)[0].addEventListener("change", async event => {
			if (event.target.checked) frontendDefaultRedirects.push(element.className)
			else {
				let index = frontendDefaultRedirects.indexOf(element.className)
				if (index > -1) frontendDefaultRedirects.splice(index, 1)
			}

			options[frontend][network].enabled = frontendDefaultRedirects
			browser.storage.local.set({ options }, () => calcCheckBoxes())
		})
	}

	function calcCustomInstances() {
		document.getElementById(frontend).getElementsByClassName("custom-checklist")[0].innerHTML = customInstances
			.map(
				x => `
				<div>
                	${x}
					<button class="add clear-${x}">
						<svg xmlns="https://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor">
							<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
						</svg>
					</button>
              	</div>
              	<hr>`
			)
			.join("\n")

		for (const item of customInstances) {
			document.getElementById(frontend).getElementsByClassName(`clear-${item}`)[0].addEventListener("click", async () => {
				let index = customInstances.indexOf(item)
				if (index > -1) customInstances.splice(index, 1)
				options[frontend][network].custom = customInstances
				browser.storage.local.set({ options }, () => calcCustomInstances())
			})
		}
	}
	calcCustomInstances()
	document.getElementById(frontend).getElementsByClassName("custom-instance-form")[0].addEventListener("submit", async event => {
		event.preventDefault();
		event.preventDefault()
		let frontendCustomInstanceInput = document.getElementById(frontend).getElementsByClassName("custom-instance")[0]
		let url
		try {
			url = new URL(frontendCustomInstanceInput.value)
		} catch (error) {
			return
		}
		let protocolHostVar = utils.protocolHost(url)
		if (frontendCustomInstanceInput.validity.valid && !redirects[frontend][network].includes(protocolHostVar)) {
			if (!customInstances.includes(protocolHostVar)) {
				customInstances.push(protocolHostVar)
				options[frontend][network].custom = customInstances
				browser.storage.local.set({ options }, () => {
					frontendCustomInstanceInput.value = ""
					calcCustomInstances()
				})
			}
		}
	})
}