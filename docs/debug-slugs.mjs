import { getCollection } from 'astro:content';

const docs = await getCollection('docs');
console.log('Available slugs:');
docs.forEach(doc => console.log(`  - ${doc.id} -> slug: ${doc.slug || doc.id}`));
