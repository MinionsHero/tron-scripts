import ansiRegex from './ansi-regex';

export default function stripAnsi(str) {
	if (typeof str !== 'string') {
		throw new TypeError(`Expected a \`string\`, got \`${typeof str}\``);
	}

	return str.replace(ansiRegex(), '');
}
