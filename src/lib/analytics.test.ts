import { expect, test } from 'bun:test';
import { safePageLocation } from './analytics';
test('page location removes query strings and estimator references', () => {
  expect(safePageLocation('https://goat.test/estimate/secret?email=private%40example.com')).toEqual({ page_path: '/estimate', page_location: 'https://goat.test/estimate' });
  expect(safePageLocation('https://goat.test/services?token=secret')).toEqual({ page_path: '/services', page_location: 'https://goat.test/services' });
});
