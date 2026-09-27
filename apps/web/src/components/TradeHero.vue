<script setup lang="ts">
withDefaults(defineProps<{
  title:string;
  subtitle:string;
  slogan?:string;
  variant?:'dashboard'|'orders'|'shipments';
}>(),{variant:'dashboard'});
</script>
<template>
  <section class="trade-hero" :class="'trade-hero-'+variant">
    <div class="trade-hero-copy">
      <h1>{{title}}</h1>
      <p>{{subtitle}}</p>
    </div>
    <div class="trade-hero-art" aria-hidden="true">
      <div v-if="slogan" class="trade-hero-slogan">{{slogan}}</div>
    </div>
    <div class="trade-hero-actions"><slot/></div>
  </section>
</template>