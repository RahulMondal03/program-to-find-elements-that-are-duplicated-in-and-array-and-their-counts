"""Sum the even numbers in a list."""


def sum_even_numbers(numbers):
    """Return the sum of the even numbers in ``numbers``.

    Args:
        numbers: An iterable of integers.

    Returns:
        The sum of every even element, or 0 if there are none.
    """
    return sum(n for n in numbers if n % 2 == 0)


if __name__ == "__main__":
    print(sum_even_numbers([1, 2, 3, 4, 5, 6]))  # 12
    print(sum_even_numbers([1, 3, 5]))           # 0
    print(sum_even_numbers([-2, -3, 0, 7]))      # -2
