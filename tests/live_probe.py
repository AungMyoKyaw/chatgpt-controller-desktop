import pathlib,urllib.request,json
key=pathlib.Path.home().joinpath(".config/chatgpt-browser-controller/bridge.key").read_text().strip()
url="http://127.0.0.1:8791/v1/conversations?limit=3"
req=urllib.request.Request(url,headers={"X-Bridge-Key":key})
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
try:
    with opener.open(req,timeout=30) as response:
        payload=json.load(response)
        print("AUTH_API_STATUS",response.status)
        print("VISIBLE_CONVERSATIONS",len(payload.get("conversations",[])))
        print("RESPONSE_SCOPE",payload.get("scope"))
except urllib.error.HTTPError as exc:
    print("AUTH_API_STATUS",exc.code)
    print("AUTH_API_ERROR",json.loads(exc.read().decode()).get("error","unknown")[:120])
