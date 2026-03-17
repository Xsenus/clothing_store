using System.Text.Json.Nodes;
using Store.Api.Models;

namespace Store.Api.Services;

/// <summary>
/// Предоставляет вспомогательные методы для работы с JSON товара.
/// </summary>
public static class ProductJsonService
{
    /// <summary>
    /// Преобразует JSON товара в объект.
    /// </summary>
    public static JsonObject Parse(Product product)
    {
        var json = JsonNode.Parse(product.Data)?.AsObject() ?? new JsonObject();
        if (json["reviewsEnabled"] is null)
            json["reviewsEnabled"] = true;
        return json;
    }

    /// <summary>
    /// Применяет изменяемые поля из запроса к товару.
    /// </summary>
    public static JsonObject Merge(JsonObject source, JsonObject patch)
    {
        foreach (var item in patch)
        {
            source[item.Key] = item.Value?.DeepClone();
        }

        return source;
    }
}
