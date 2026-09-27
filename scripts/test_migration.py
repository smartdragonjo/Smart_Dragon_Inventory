import unittest

from analyze_csv import analyze, is_unknown, is_not_applicable
from build_migration_preview import classify, read_records
from prepare_import import parse_bulb
from pathlib import Path


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.record = read_records(Path('exports/data_clean.csv'))[0]

    def test_not_applicable_is_complete(self):
        for value in ('N/A', ' n/a ', 'NA'):
            with self.subTest(value=value):
                self.record['Fog_Light_Bulb'] = value
                self.assertFalse(is_unknown(value))
                self.assertTrue(is_not_applicable(value))
                self.assertEqual(classify([self.record])[0]['Migration_Status'], 'ready')
                self.assertTrue(parse_bulb(value)['notApplicable'])
                _, issues, _ = analyze([self.record])
                self.assertFalse(any(i['Field'] == 'Fog_Light_Bulb' for i in issues))

    def test_missing_information_still_needs_review(self):
        for value in ('', 'unknown', 'لا توجد معلومات'):
            self.record['Fog_Light_Bulb'] = value
            self.assertTrue(is_unknown(value))
            self.assertEqual(classify([self.record])[0]['Migration_Status'], 'needs_review')

    def test_invalid_year_not_rescued_by_not_applicable(self):
        self.record['Year_Start'] = 'N/A'
        self.record['Fog_Light_Bulb'] = 'N/A'
        self.assertEqual(classify([self.record])[0]['Migration_Status'], 'needs_review')


if __name__ == '__main__':
    unittest.main()
