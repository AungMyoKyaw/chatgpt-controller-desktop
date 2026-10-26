import {defineConfig} from "vite";
import {sveltekit} from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
 plugins:[sveltekit(),tailwindcss()],
 clearScreen:false,
 server:{port:1431,strictPort:true,host:"127.0.0.1",watch:{ignored:["**/src-tauri/**","**/samples/**"]}}
});
