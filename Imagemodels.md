Models ID for model identity.
{
  "data": [
    {
      "id": "img3",
      "name": "Imagen 3"
    },
    {
      "id": "img4",
      "name": "Imagen 4"
    },
    {
      "id": "qwen",
      "name": "Qwen"
    },
    {
      "id": "flux-schnell",
      "name": "Flux Schnell"
    },
    {
      "id": "lucid-origin",
      "name": "Lucid Origin"
    },
    {
      "id": "phoenix",
      "name": "Phoenix"
    },
    {
      "id": "sdxl",
      "name": "SDXL"
    },
    {
      "id": "nbpro",
      "name": "Nano Banana Pro"
    },
    {
      "id": "nano-banana",
      "name": "Nano Banana"
    },
    {
      "id": "sdxl-lite",
      "name": "SDXL Lite"
    }
  ]
}

API key - added in the .env file

Curl Request Example

curl -X POST https://api.infip.pro/v1/images/generations \
  -H "Authorization: Bearer infip-fb44f1d5" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flux-schnell",
    "prompt": "A majestic lion in a field of wildflowers",
    "n": 1,
    "size": "1024x1024"
  }'