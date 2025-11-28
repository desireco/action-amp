import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sampleDataDir = path.join(projectRoot, 'sample-data');
const dataDir = path.join(projectRoot, 'data');

console.log(`Seeding data from ${sampleDataDir} to ${dataDir}...`);

if (!fs.existsSync(sampleDataDir)) {
    console.error('Error: sample-data directory not found!');
    process.exit(1);
}

if (fs.existsSync(dataDir)) {
    console.log('Data directory already exists. Skipping seed to prevent overwriting user data.');
    console.log('To reset data, delete the "data" directory and run this command again.');
} else {
    try {
        fs.cpSync(sampleDataDir, dataDir, { recursive: true });
        console.log('Successfully seeded data directory.');
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
}
