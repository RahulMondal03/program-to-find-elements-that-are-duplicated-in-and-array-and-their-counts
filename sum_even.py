"""Sum the even numbers in a list."""


def sum_even_numbers(numbers):
    """Return the sum of the even numbers in ``numbers``.

    Args:
        numbers: A list (or other non-string iterable) of integers.

    Returns:
        The sum of every even element, or 0 if there are none.

    Raises:
        TypeError: If ``numbers`` is not a non-string iterable, or if any
            element is not an integer. Booleans are rejected even though
            ``bool`` is a subclass of ``int``.
    """
    if isinstance(numbers, (str, bytes)) or not hasattr(numbers, "__iter__"):
        raise TypeError(
            f"numbers must be an iterable of integers, got {type(numbers).__name__}"
        )

    total = 0
    for index, value in enumerate(numbers):
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(
                f"numbers[{index}] must be an integer, got "
                f"{type(value).__name__}: {value!r}"
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
            print(f"{bad!r} -> TypeError: {exc}")
