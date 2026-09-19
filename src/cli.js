import { chooseMove } from './jev.js';

try {
  const history = process.argv.slice(2);
  const result = await chooseMove(history, {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: process.env.TYPESAFE_MODEL || 'jev-1.13.0'
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
