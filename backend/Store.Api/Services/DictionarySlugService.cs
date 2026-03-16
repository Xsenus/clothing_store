using System.Text;

namespace Store.Api.Services;

public static class DictionarySlugService
{
    private static readonly IReadOnlyDictionary<char, string> TransliterationMap = new Dictionary<char, string>
    {
        ['а'] = "a",
        ['б'] = "b",
        ['в'] = "v",
        ['г'] = "g",
        ['д'] = "d",
        ['е'] = "e",
        ['ё'] = "e",
        ['ж'] = "zh",
        ['з'] = "z",
        ['и'] = "i",
        ['й'] = "i",
        ['к'] = "k",
        ['л'] = "l",
        ['м'] = "m",
        ['н'] = "n",
        ['о'] = "o",
        ['п'] = "p",
        ['р'] = "r",
        ['с'] = "s",
        ['т'] = "t",
        ['у'] = "u",
        ['ф'] = "f",
        ['х'] = "h",
        ['ц'] = "c",
        ['ч'] = "ch",
        ['ш'] = "sh",
        ['щ'] = "shch",
        ['ы'] = "y",
        ['э'] = "e",
        ['ю'] = "yu",
        ['я'] = "ya"
    };

    public static string Normalize(string? value, string fallback = "item")
    {
        var slug = BuildSlug(value);
        return string.IsNullOrWhiteSpace(slug) ? fallback : slug;
    }

    public static string EnsureUnique(string? value, ISet<string> occupiedSlugs, string fallback = "item")
    {
        var baseSlug = Normalize(value, fallback);
        var slug = baseSlug;
        var suffix = 2;

        while (!occupiedSlugs.Add(slug))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return slug;
    }

    public static string BuildSlug(string? value)
    {
        var input = value?.Trim().ToLowerInvariant() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(input))
            return string.Empty;

        var raw = new StringBuilder(input.Length * 2);
        foreach (var ch in input)
        {
            if (ch is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                raw.Append(ch);
                continue;
            }

            if (TransliterationMap.TryGetValue(ch, out var mapped))
            {
                raw.Append(mapped);
                continue;
            }

            raw.Append('-');
        }

        var normalized = new StringBuilder(raw.Length);
        var previousDash = false;
        foreach (var ch in raw.ToString())
        {
            if (ch == '-')
            {
                if (previousDash || normalized.Length == 0)
                    continue;

                normalized.Append(ch);
                previousDash = true;
                continue;
            }

            normalized.Append(ch);
            previousDash = false;
        }

        return normalized.ToString().Trim('-');
    }
}
