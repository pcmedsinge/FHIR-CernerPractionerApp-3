interface SmartOauth2Api {
	authorize(options: Record<string, unknown>): Promise<unknown> | unknown;
}

interface SmartClientModule {
	oauth2: SmartOauth2Api;
}

function getSmartClient(candidate: unknown): SmartClientModule {
	if (typeof candidate !== 'object' || candidate === null) {
		throw new Error('SMART client module is unavailable.');
	}

	const moduleObject = candidate as Record<string, unknown>;
	const resolved = (moduleObject.default ?? moduleObject) as Record<string, unknown>;
	const oauth2 = resolved.oauth2;

	if (typeof oauth2 !== 'object' || oauth2 === null) {
		throw new Error('SMART oauth2 API not found.');
	}

	const authorize = (oauth2 as Record<string, unknown>).authorize;
	if (typeof authorize !== 'function') {
		throw new Error('SMART oauth2.authorize is not available.');
	}

	return {
		oauth2: {
			authorize: authorize as SmartOauth2Api['authorize'],
		},
	};
}

function readLaunchParams(): { iss: string; launch: string } {
	const query = new URLSearchParams(window.location.search);
	const iss = query.get('iss')?.trim() ?? '';
	const launch = query.get('launch')?.trim() ?? '';

	if (!iss || !launch) {
		throw new Error('Missing SMART launch parameters: iss and launch are required.');
	}

	return { iss, launch };
}

export function hasSmartLaunchParams(): boolean {
	const query = new URLSearchParams(window.location.search);
	return Boolean(query.get('iss') && query.get('launch'));
}

export async function initiateSmartLaunch(): Promise<void> {
	const smartClient = getSmartClient(await import('fhirclient'));
	const { iss, launch } = readLaunchParams();

	const authorizeOptions: Record<string, unknown> = {
		clientId: import.meta.env.VITE_CLIENT_ID,
		scope: import.meta.env.VITE_SCOPES,
		redirectUri: import.meta.env.VITE_REDIRECT_URI,
		iss,
		launch,
		aud: import.meta.env.VITE_FHIR_BASE_URL,
		authorizeUri: import.meta.env.VITE_AUTH_ENDPOINT,
		tokenUri: import.meta.env.VITE_TOKEN_ENDPOINT,
	};

	await Promise.resolve(smartClient.oauth2.authorize(authorizeOptions));
}
