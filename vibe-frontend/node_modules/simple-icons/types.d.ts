// @ts-check
/**
 * @file Types for Simple Icons package.
 */

import type {License} from './data/simple-icons.d.ts';

export type {
	Aliases,
	CustomLicense,
	DuplicateAlias,
	IconData,
	License,
	SPDXLicense,
} from './data/simple-icons.d.ts';

/**
 * The data for a Simple Icon as is exported by the npm package.
 */
export type SimpleIcon = {
	title: string;
	slug: string;
	svg: string;
	path: string;
	source: string;
	hex: string;
	guidelines?: string;
	license?: License;
};
