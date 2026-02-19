"""Example test file demonstrating pytest and hypothesis setup."""

import pytest
from hypothesis import given, strategies as st


@pytest.mark.unit
def test_example_unit():
    """Example unit test."""
    assert 1 + 1 == 2


@pytest.mark.property_test
@given(x=st.integers(), y=st.integers())
def test_example_property(x: int, y: int):
    """
    Example property-based test.
    
    Property: Addition is commutative.
    """
    assert x + y == y + x


@pytest.mark.property_test
@given(numbers=st.lists(st.integers(), min_size=1))
def test_example_list_property(numbers: list[int]):
    """
    Example property-based test with lists.
    
    Property: Reversing a list twice returns the original list.
    """
    assert list(reversed(list(reversed(numbers)))) == numbers
