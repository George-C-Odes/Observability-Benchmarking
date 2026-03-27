from __future__ import annotations

from django.test import SimpleTestCase

from obbench_django_common.infrastructure.cache.cachetools_adapter import CachetoolsAdapter
from obbench_django_common.infrastructure.cache.dict_adapter import DictCacheAdapter
from obbench_django_common.infrastructure.cache.factory import create_cache


class CacheFactoryTests(SimpleTestCase):
    def test_create_dict_cache_populates_entries(self) -> None:
        cache = create_cache(3, "dict")
        self.addCleanup(cache.close)

        self.assertIsInstance(cache, DictCacheAdapter)
        self.assertEqual(3, cache.size())
        self.assertEqual("value-1", cache.get("1"))
        self.assertEqual("value-3", cache.get("3"))

    def test_create_cachetools_cache_populates_entries(self) -> None:
        cache = create_cache(2, "cachetools")
        self.addCleanup(cache.close)

        self.assertIsInstance(cache, CachetoolsAdapter)
        self.assertEqual(2, cache.size())
        self.assertEqual("value-1", cache.get("1"))
        self.assertEqual("value-2", cache.get("2"))

    def test_unknown_cache_impl_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            create_cache(1, "unsupported")
