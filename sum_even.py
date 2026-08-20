"""Sum the even numbers in a list."""

from collections.abc import Iterable


def sum_even_numbers(numbers):
    """Return the sum of the even integers in ``numbers``.

    Args:
        numbers: An iterable of integers. Booleans are rejected even though
            they are technically ``int`` subclasses, since ``True``/``False``
            are almost never meant as numbers here.

    Returns:
        The sum of every even element, or 0 if there are none.

    Raises:
        TypeError: If ``numbers`` is not an iterable, if it is a string, or if
            any element is not an integer.
    """
    if isinstance(numbers, (str, bytes)) or not isinstance(numbers, Iterable):
        raise TypeError(
            f"numbers must be an iterable of integers, got {type(numbers).__name__}"
        )

    total = 0
    for index, value in enumerate(numbers):
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(
                f"numbers[{index}] must be an integer, "
                f"got {type(value).__name__}: {value!r}"
            )
        if value % 2 == 0:
            total += value
    return total


if __name__ == "__main__":
    print(sum_even_numbers([1, 2, 3, 4, 5, 6]))  # 12
    print(sum_even_numbers([1, 3, 5]))           # 0
    print(sum_even_numbers([-2, -3, 0, 7]))      # -2

    for bad in ([1, "2", 3], [1, 2.0], [1, None], [1, True], "123", 42):
        try:
            sum_even_numbers(bad)
        except TypeError as exc:
            print(f"TypeError: {exc}")
