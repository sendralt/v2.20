#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const rootDir = path.resolve(__dirname, '..');
const inputPath = path.join(rootDir, 'src', 'input.css');
const sharedPath = path.join(rootDir, 'public', 'css', 'shared.css');
const outputPath = path.join(rootDir, 'public', 'css', 'tailwind.debug.css');
const configPath = path.join(rootDir, 'tailwind.config.js');

async function buildRootWithImports() {
    const inputCss = await fs.readFile(inputPath, 'utf8');
    const inputRoot = postcss.parse(inputCss, { from: inputPath });
    const root = postcss.root();
    root.source = inputRoot.source;

    for (const node of inputRoot.nodes) {
        if (node.type === 'atrule' && node.name === 'import') {
            const importTarget = node.params.replace(/["';]/g, '').trim();
            const resolved = path.resolve(path.dirname(inputPath), importTarget);

            if (path.normalize(resolved) === path.normalize(sharedPath)) {
                const sharedCss = await fs.readFile(sharedPath, 'utf8');
                const sharedRoot = postcss.parse(sharedCss, { from: sharedPath });
                root.append(...sharedRoot.nodes.map(child => child.clone()));
                continue;
            }
        }

        root.append(node.clone());
    }

    return root;
}

async function main() {
    const root = await buildRootWithImports();
    const result = await postcss([
        tailwindcss({ config: configPath }),
        autoprefixer
    ]).process(root, {
        from: inputPath,
        to: outputPath,
        map: { inline: false, annotation: true, sourcesContent: true }
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, result.css);
    if (result.map) {
        await fs.writeFile(`${outputPath}.map`, result.map.toString());
    }

    console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
    console.log(`Wrote ${path.relative(rootDir, `${outputPath}.map`)}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});