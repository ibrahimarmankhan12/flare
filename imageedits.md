Add image edit 

Use Open AI SDK

Example Request

from openai import OpenAI

client = OpenAI(
    api_key="YOUR_A4F_API_KEY",
    base_url="https://api.a4f.co/v1"
)

with open("/path/to/your/image.png", "rb") as image_file:
    response = client.images.edit(
        model="provider-3/flux-kontext-pro",
        image=image_file,
        prompt="Add a cute hat to the subject",
        response_format="url"
    )

edited_image_url = response.data[0].url
print(f"Edited image URL: {edited_image_url}")

Example Response

{
  "created": 1677652288,
  "data": [
    {
      "url": "https://api.a4f.co/v1/images/serve/a1b2c3d4e5f6..."
    }
  ]
}


Models
provider-3/flux-kontext-max
provider-3/flux-kontext-pro
